from __future__ import annotations

from random import Random

from django.apps import apps
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.text import slugify

STRESS_APP_LABELS = (
    "stress_core",
    "stress_dense_alpha",
    "stress_dense_beta",
    "stress_dense_gamma",
    "stress_chain_delta",
    "stress_chain_epsilon",
    "stress_chain_zeta",
)
TARGET_MODEL_NAMES = tuple(f"StressTarget{index:02d}" for index in range(1, 37))


class Command(BaseCommand):
    help = "Generate relation-heavy schema stress data for UI edge testing."

    def add_arguments(self, parser):
        parser.add_argument(
            "--label",
            default="schema-stress",
            help="Dataset label used to isolate generated records.",
        )
        parser.add_argument(
            "--replace",
            action="store_true",
            help="Delete an existing stress dataset with the same label before regenerating it.",
        )
        parser.add_argument(
            "--anchors",
            type=int,
            default=2,
            help="Number of root anchor records to create.",
        )
        parser.add_argument(
            "--records-per-target",
            type=int,
            default=2,
            help="Number of records to create per target model and anchor.",
        )
        parser.add_argument(
            "--hubs-per-dense-app",
            type=int,
            default=3,
            help="Number of dense hub records to create in each dense stress app.",
        )
        parser.add_argument(
            "--seed",
            type=int,
            default=20260421,
            help="Deterministic seed for relation fanout choices.",
        )
        parser.add_argument(
            "--keep-registry-status",
            action="store_true",
            help="Do not enable stress models in the QLab model registry.",
        )

    def handle(self, *args, **options):
        label = slugify(options["label"])
        if not label:
            raise CommandError("Label must contain at least one alphanumeric character.")

        anchors_count = options["anchors"]
        records_per_target = options["records_per_target"]
        hubs_per_dense_app = options["hubs_per_dense_app"]
        for option_name, value in (
            ("anchors", anchors_count),
            ("records-per-target", records_per_target),
            ("hubs-per-dense-app", hubs_per_dense_app),
        ):
            if value < 1:
                raise CommandError(f"{option_name} must be at least 1.")

        if self._dataset_exists(label):
            if not options["replace"]:
                raise CommandError(
                    f'Dataset "{label}" already exists. Use --replace or choose another label.'
                )
            self.stdout.write(f'Removing existing schema stress dataset "{label}"...')
            self._delete_dataset(label)

        rng = Random(options["seed"])
        with transaction.atomic():
            summary = self._create_dataset(
                label=label,
                anchors_count=anchors_count,
                records_per_target=records_per_target,
                hubs_per_dense_app=hubs_per_dense_app,
                rng=rng,
            )
            if not options["keep_registry_status"]:
                summary["registry_models_enabled"] = self._enable_stress_registry_entries()

        self.stdout.write(self.style.SUCCESS(f'Schema stress dataset "{label}" is ready.'))
        for key, value in summary.items():
            self.stdout.write(f"  {key}: {value}")

    def _dataset_exists(self, label: str) -> bool:
        return apps.get_model("stress_core", "StressAnchor").objects.filter(
            dataset_label=label
        ).exists()

    def _delete_dataset(self, label: str) -> None:
        delete_order = (
            ("stress_chain_zeta", "ZetaCheckpoint"),
            ("stress_chain_zeta", "ZetaStep"),
            ("stress_chain_zeta", "ZetaScenario"),
            ("stress_chain_epsilon", "EpsilonComment"),
            ("stress_chain_epsilon", "EpsilonCard"),
            ("stress_chain_epsilon", "EpsilonWorkspace"),
            ("stress_chain_delta", "DeltaBundle"),
            ("stress_chain_delta", "DeltaLink"),
            ("stress_chain_delta", "DeltaNode"),
            ("stress_dense_gamma", "GammaHub"),
            ("stress_dense_beta", "BetaHub"),
            ("stress_dense_alpha", "AlphaHub"),
            *tuple(("stress_core", model_name) for model_name in reversed(TARGET_MODEL_NAMES)),
            ("stress_core", "StressAnchor"),
        )
        with transaction.atomic():
            for app_label, model_name in delete_order:
                model = apps.get_model(app_label, model_name)
                model.objects.filter(dataset_label=label).delete()

    def _create_dataset(
        self,
        *,
        label: str,
        anchors_count: int,
        records_per_target: int,
        hubs_per_dense_app: int,
        rng: Random,
    ) -> dict[str, int]:
        user = self._get_or_create_user(label)
        anchors = self._create_anchors(label, anchors_count)
        targets_by_index = self._create_targets(label, anchors, records_per_target)

        alpha_hubs = self._create_dense_hubs(
            label=label,
            app_label="stress_dense_alpha",
            model_name="AlphaHub",
            anchors=anchors,
            targets_by_index=targets_by_index,
            count=hubs_per_dense_app,
            rng=rng,
        )
        beta_hubs = self._create_dense_hubs(
            label=label,
            app_label="stress_dense_beta",
            model_name="BetaHub",
            anchors=anchors,
            targets_by_index=targets_by_index,
            count=hubs_per_dense_app,
            rng=rng,
            extra_kwargs=lambda index: {"alpha_hub": alpha_hubs[index]},
        )
        gamma_hubs = self._create_dense_hubs(
            label=label,
            app_label="stress_dense_gamma",
            model_name="GammaHub",
            anchors=anchors,
            targets_by_index=targets_by_index,
            count=hubs_per_dense_app,
            rng=rng,
            extra_kwargs=lambda index: {
                "alpha_hub": alpha_hubs[index % len(alpha_hubs)],
                "beta_hub": beta_hubs[index % len(beta_hubs)],
            },
        )

        delta_nodes, delta_links, delta_bundles = self._create_delta_chain(
            label,
            targets_by_index,
            alpha_hubs,
            hubs_per_dense_app,
        )
        epsilon_workspaces, epsilon_cards, epsilon_comments = self._create_epsilon_chain(
            label,
            targets_by_index,
            delta_nodes,
            user,
            hubs_per_dense_app,
        )
        zeta_scenarios, zeta_steps, zeta_checkpoints = self._create_zeta_chain(
            label,
            anchors,
            targets_by_index,
            alpha_hubs,
            beta_hubs,
            gamma_hubs,
            delta_bundles,
            hubs_per_dense_app,
        )

        return {
            "anchors": len(anchors),
            "target_models": len(TARGET_MODEL_NAMES),
            "target_records": sum(len(records) for records in targets_by_index.values()),
            "alpha_hubs": len(alpha_hubs),
            "beta_hubs": len(beta_hubs),
            "gamma_hubs": len(gamma_hubs),
            "delta_nodes": len(delta_nodes),
            "delta_links": len(delta_links),
            "delta_bundles": len(delta_bundles),
            "epsilon_workspaces": len(epsilon_workspaces),
            "epsilon_cards": len(epsilon_cards),
            "epsilon_comments": len(epsilon_comments),
            "zeta_scenarios": len(zeta_scenarios),
            "zeta_steps": len(zeta_steps),
            "zeta_checkpoints": len(zeta_checkpoints),
        }

    def _enable_stress_registry_entries(self) -> int:
        try:
            registry_model = apps.get_model("qlab", "ModelRegistry")
        except LookupError:
            return 0

        enabled_count = 0
        for app_label in STRESS_APP_LABELS:
            app_config = apps.get_app_config(app_label)
            for model in app_config.get_models():
                entry, _created = registry_model.objects.get_or_create(
                    model_label=f"{app_label}_{model.__name__}",
                    defaults={
                        "app_label": app_label,
                        "model_name": model.__name__,
                        "status": "enabled",
                    },
                )
                update_fields = []
                if entry.app_label != app_label:
                    entry.app_label = app_label
                    update_fields.append("app_label")
                if entry.model_name != model.__name__:
                    entry.model_name = model.__name__
                    update_fields.append("model_name")
                if entry.status != "enabled":
                    entry.status = "enabled"
                    update_fields.append("status")
                if update_fields:
                    entry.save(update_fields=update_fields)
                enabled_count += 1
        return enabled_count

    def _get_or_create_user(self, label: str):
        user_model = get_user_model()
        user, _ = user_model.objects.get_or_create(
            username=f"{label}-owner",
            defaults={"email": f"{label}@example.invalid"},
        )
        return user

    def _create_anchors(self, label: str, count: int):
        anchor_model = apps.get_model("stress_core", "StressAnchor")
        return [
            anchor_model.objects.create(
                dataset_label=label,
                name=f"{label} anchor {index:02d}",
                external_key=f"{label}-anchor-{index:02d}",
                payload={"kind": "schema-stress-anchor", "index": index},
            )
            for index in range(1, count + 1)
        ]

    def _create_targets(self, label: str, anchors, records_per_target: int):
        targets_by_index = {}
        for target_index, model_name in enumerate(TARGET_MODEL_NAMES, start=1):
            model = apps.get_model("stress_core", model_name)
            records = []
            for anchor_index, anchor in enumerate(anchors, start=1):
                for record_index in range(1, records_per_target + 1):
                    ordinal = (anchor_index * 1000) + record_index
                    records.append(
                        model.objects.create(
                            dataset_label=label,
                            name=(
                                f"{label} target {target_index:02d} "
                                f"{anchor_index:02d}-{record_index:02d}"
                            ),
                            code=(
                                f"{label}-t{target_index:02d}-"
                                f"a{anchor_index:02d}-r{record_index:02d}"
                            ),
                            ordinal=ordinal,
                            anchor=anchor,
                            metadata={
                                "targetIndex": target_index,
                                "anchorIndex": anchor_index,
                                "recordIndex": record_index,
                            },
                        )
                    )
            targets_by_index[target_index] = records
        return targets_by_index

    def _create_dense_hubs(
        self,
        *,
        label: str,
        app_label: str,
        model_name: str,
        anchors,
        targets_by_index: dict[int, list],
        count: int,
        rng: Random,
        extra_kwargs=None,
    ):
        model = apps.get_model(app_label, model_name)
        hubs = []
        for index in range(count):
            field_values = {
                "dataset_label": label,
                "name": f"{label} {model_name} {index + 1:02d}",
                "anchor": anchors[index % len(anchors)],
                "secondary_anchor": anchors[(index + 1) % len(anchors)],
                "status": "ready",
                "payload": {"hubIndex": index + 1, "appLabel": app_label},
            }
            for target_index in range(1, 31):
                choices = targets_by_index[target_index]
                field_values[f"target_{target_index:02d}"] = choices[
                    rng.randrange(len(choices))
                ]
            if extra_kwargs:
                field_values.update(extra_kwargs(index))

            hub = model.objects.create(**field_values)
            for target_index in range(31, 37):
                choices = targets_by_index[target_index]
                getattr(hub, f"target_set_{target_index:02d}").set(
                    choices[: min(3, len(choices))]
                )
            hubs.append(hub)
        return hubs

    def _create_delta_chain(self, label, targets_by_index, alpha_hubs, count: int):
        delta_node = apps.get_model("stress_chain_delta", "DeltaNode")
        delta_link = apps.get_model("stress_chain_delta", "DeltaLink")
        delta_bundle = apps.get_model("stress_chain_delta", "DeltaBundle")

        node_count = max(4, count * 2)
        nodes = []
        for index in range(node_count):
            nodes.append(
                delta_node.objects.create(
                    dataset_label=label,
                    name=f"{label} delta node {index + 1:02d}",
                    parent=nodes[index - 1] if index else None,
                    core_target=targets_by_index[1][index % len(targets_by_index[1])],
                    alternate_target=targets_by_index[2][index % len(targets_by_index[2])],
                )
            )

        links = []
        for index, source in enumerate(nodes[:-1]):
            link = delta_link.objects.create(
                dataset_label=label,
                name=f"{label} delta link {index + 1:02d}",
                source=source,
                target=nodes[index + 1],
                alpha_hub=alpha_hubs[index % len(alpha_hubs)],
            )
            link.tags.set(targets_by_index[3][: min(3, len(targets_by_index[3]))])
            links.append(link)

        bundles = []
        for index in range(max(1, count)):
            bundle = delta_bundle.objects.create(
                dataset_label=label,
                name=f"{label} delta bundle {index + 1:02d}",
                preferred_link=links[index % len(links)] if links else None,
                owner_target=targets_by_index[4][index % len(targets_by_index[4])],
            )
            bundle.nodes.set(nodes)
            bundle.links.set(links)
            bundles.append(bundle)
        return nodes, links, bundles

    def _create_epsilon_chain(self, label, targets_by_index, delta_nodes, user, count: int):
        workspace_model = apps.get_model("stress_chain_epsilon", "EpsilonWorkspace")
        card_model = apps.get_model("stress_chain_epsilon", "EpsilonCard")
        comment_model = apps.get_model("stress_chain_epsilon", "EpsilonComment")

        workspaces = []
        cards = []
        comments = []
        for index in range(max(1, count)):
            workspace = workspace_model.objects.create(
                dataset_label=label,
                name=f"{label} epsilon workspace {index + 1:02d}",
                root_delta_node=delta_nodes[index % len(delta_nodes)],
                owner=user,
                primary_target=targets_by_index[5][index % len(targets_by_index[5])],
            )
            workspaces.append(workspace)
            previous_card = None
            for card_index in range(2):
                card = card_model.objects.create(
                    dataset_label=label,
                    title=f"{label} epsilon card {index + 1:02d}-{card_index + 1:02d}",
                    workspace=workspace,
                    primary_target=targets_by_index[6][card_index % len(targets_by_index[6])],
                    secondary_target=targets_by_index[7][card_index % len(targets_by_index[7])],
                )
                if previous_card:
                    card.related_cards.add(previous_card)
                cards.append(card)
                previous_card = card

                comment = comment_model.objects.create(
                    dataset_label=label,
                    card=card,
                    author=user,
                    body=f"Stress comment for {card.title}",
                )
                comment.mentioned_targets.set(
                    targets_by_index[8][: min(3, len(targets_by_index[8]))]
                )
                comments.append(comment)
        return workspaces, cards, comments

    def _create_zeta_chain(
        self,
        label,
        anchors,
        targets_by_index,
        alpha_hubs,
        beta_hubs,
        gamma_hubs,
        delta_bundles,
        count: int,
    ):
        scenario_model = apps.get_model("stress_chain_zeta", "ZetaScenario")
        step_model = apps.get_model("stress_chain_zeta", "ZetaStep")
        checkpoint_model = apps.get_model("stress_chain_zeta", "ZetaCheckpoint")

        scenarios = []
        steps = []
        checkpoints = []
        for index in range(max(1, count)):
            scenario = scenario_model.objects.create(
                dataset_label=label,
                name=f"{label} zeta scenario {index + 1:02d}",
                anchor=anchors[index % len(anchors)],
                alpha_hub=alpha_hubs[index % len(alpha_hubs)],
                beta_hub=beta_hubs[index % len(beta_hubs)],
                gamma_hub=gamma_hubs[index % len(gamma_hubs)],
            )
            scenarios.append(scenario)
            previous_step = None
            scenario_steps = []
            for step_index in range(3):
                step = step_model.objects.create(
                    dataset_label=label,
                    scenario=scenario,
                    name=f"{label} zeta step {index + 1:02d}-{step_index + 1:02d}",
                    previous_step=previous_step,
                    gateway_target=targets_by_index[10][step_index % len(targets_by_index[10])],
                )
                step.fanout_targets.set(
                    targets_by_index[9][: min(3, len(targets_by_index[9]))]
                )
                scenario_steps.append(step)
                steps.append(step)
                previous_step = step

            for step_index, step in enumerate(scenario_steps):
                checkpoint = checkpoint_model.objects.create(
                    dataset_label=label,
                    step=step,
                    delta_bundle=delta_bundles[index % len(delta_bundles)],
                    review_target=targets_by_index[11][
                        step_index % len(targets_by_index[11])
                    ],
                )
                checkpoint.depends_on.set(scenario_steps[:step_index])
                checkpoints.append(checkpoint)
        return scenarios, steps, checkpoints
