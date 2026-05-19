"""
Seed canvas benchmark data.

Creates a single BusinessGroup that transitively reaches N distinct
CloudProviders via the existing schema relations:

    BusinessGroup ─→ Network ─→ Region ─→ CloudProvider

There is no direct BusinessGroup ↔ CloudProvider FK in the model graph,
so we materialise N parallel chains of (Network, Region, CloudProvider).
Each chain has exactly one CloudProvider that's transitively reachable
from the BusinessGroup. The shared single Environment keeps the
intermediate fan-out as compact as possible.

Run:
    python manage.py seed_canvas_benchmark              # 5000 CloudProviders
    python manage.py seed_canvas_benchmark --count 1000 # smaller test set
    python manage.py seed_canvas_benchmark --reset      # delete & rebuild

After seeding, in the builder:
    1. Pick start model = BusinessGroup
    2. Pick example record = "BG-Benchmark-{count}"
    3. Add layers Network → Region → CloudProvider
    4. Toggle preview — canvas should render ~{count} CloudProvider nodes

Idempotent: re-running is a no-op (matches existing rows by slug/name).
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from infrastructure.models import (
    BusinessGroup,
    CloudProvider,
    Environment,
    Network,
    Region,
)

BENCHMARK_BG_PREFIX = "BG-Benchmark-"
BENCHMARK_SLUG_PREFIX = "bench-"
BENCHMARK_ENV_NAME = "bench-env"
BATCH_SIZE = 1000


class Command(BaseCommand):
    help = (
        "Seed N CloudProviders transitively reachable from a single "
        "BusinessGroup via Network → Region → CloudProvider."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--count",
            type=int,
            default=5000,
            help="Number of CloudProviders (and thus Networks and Regions) "
            "to create. Default: 5000.",
        )
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete the benchmark BusinessGroup and all benchmark-prefixed "
            "rows before re-seeding. Other data is left intact.",
        )

    def handle(self, *args, **options):
        count: int = options["count"]
        bg_name = f"{BENCHMARK_BG_PREFIX}{count}"

        if options["reset"]:
            self._reset()

        with transaction.atomic():
            bg = self._ensure_business_group(bg_name, count)
            env = self._ensure_environment(bg)
            cps_by_slug = self._ensure_cloud_providers(count)
            regions_by_provider_id = self._ensure_regions(cps_by_slug)
            self._ensure_networks(bg, env, regions_by_provider_id)

        self.stdout.write(self.style.SUCCESS(
            f"\nSeeded benchmark scenario:\n"
            f"  BusinessGroup: {bg.name} (id={bg.id})\n"
            f"  Environment:   {env.name} (id={env.id})\n"
            f"  CloudProviders: {count}\n"
            f"  Regions: {count}\n"
            f"  Networks: {count}\n"
            f"\nIn the builder, pick start model = BusinessGroup and example "
            f"record = '{bg.name}', then traverse Network → Region → "
            f"CloudProvider to render {count} CloudProvider nodes."
        ))

    # ------------------------------------------------------------------
    # Reset
    # ------------------------------------------------------------------

    def _reset(self):
        self.stdout.write("Resetting benchmark fixtures…")
        # Networks + Regions cascade from CloudProvider deletion (FK CASCADE)
        # but we must delete networks first because they also FK to BG.
        deleted_networks, _ = Network.objects.filter(
            name__startswith=BENCHMARK_SLUG_PREFIX
        ).delete()
        deleted_regions, _ = Region.objects.filter(
            code__startswith=BENCHMARK_SLUG_PREFIX
        ).delete()
        deleted_providers, _ = CloudProvider.objects.filter(
            slug__startswith=BENCHMARK_SLUG_PREFIX
        ).delete()
        deleted_bgs, _ = BusinessGroup.objects.filter(
            name__startswith=BENCHMARK_BG_PREFIX
        ).delete()
        self.stdout.write(
            f"  removed {deleted_bgs} BGs / {deleted_networks} networks / "
            f"{deleted_regions} regions / {deleted_providers} providers"
        )

    # ------------------------------------------------------------------
    # Idempotent ensures
    # ------------------------------------------------------------------

    def _ensure_business_group(self, name: str, count: int) -> BusinessGroup:
        bg, created = BusinessGroup.objects.update_or_create(
            name=name,
            defaults={
                "description": (
                    f"Canvas perf benchmark — transitively reaches {count} "
                    "CloudProviders via Network → Region."
                ),
                "cost_center": "BENCHMARK",
            },
        )
        verb = "created" if created else "updated"
        self.stdout.write(f"BusinessGroup {verb}: {bg.name}")
        return bg

    def _ensure_environment(self, bg: BusinessGroup) -> Environment:
        env, created = Environment.objects.update_or_create(
            business_group=bg,
            name=BENCHMARK_ENV_NAME,
            defaults={"env_type": "dev"},
        )
        verb = "created" if created else "exists"
        self.stdout.write(f"Environment {verb}: {env.name}")
        return env

    def _ensure_cloud_providers(self, count: int) -> dict[str, CloudProvider]:
        target_slug_prefix = f"{BENCHMARK_SLUG_PREFIX}cp-"
        target_slugs = [
            f"{target_slug_prefix}{i:05d}" for i in range(count)
        ]
        # Use startswith (not a 5000-item IN clause) to avoid SQL limits.
        existing = {
            cp.slug: cp
            for cp in CloudProvider.objects.filter(
                slug__startswith=target_slug_prefix
            )
        }
        to_create = [
            CloudProvider(
                slug=slug,
                name=f"BenchCP{slug.removeprefix(target_slug_prefix)}",
                api_endpoint="",
            )
            for slug in target_slugs
            if slug not in existing
        ]
        if to_create:
            CloudProvider.objects.bulk_create(
                to_create, batch_size=BATCH_SIZE, ignore_conflicts=True
            )
            existing = {
                cp.slug: cp
                for cp in CloudProvider.objects.filter(
                    slug__startswith=target_slug_prefix
                )
            }
        self.stdout.write(
            f"CloudProviders: {count} ensured ({len(to_create)} new)"
        )
        # Restrict to requested range (handles smaller --count re-runs).
        return {slug: existing[slug] for slug in target_slugs if slug in existing}

    def _ensure_regions(
        self, cps_by_slug: dict[str, CloudProvider]
    ) -> dict[int, Region]:
        region_code_prefix = f"{BENCHMARK_SLUG_PREFIX}region-"
        codes_by_provider = {
            cp.id: f"{region_code_prefix}{cp.slug.removeprefix(f'{BENCHMARK_SLUG_PREFIX}cp-')}"
            for cp in cps_by_slug.values()
        }
        existing = {
            r.provider_id: r
            for r in Region.objects.filter(code__startswith=region_code_prefix)
        }
        to_create = [
            Region(
                provider_id=provider_id,
                code=code,
                name=f"BenchRegion{code.removeprefix(region_code_prefix)}",
                location="Benchmark Datacenter",
            )
            for provider_id, code in codes_by_provider.items()
            if provider_id not in existing
        ]
        if to_create:
            Region.objects.bulk_create(
                to_create, batch_size=BATCH_SIZE, ignore_conflicts=True
            )
            existing = {
                r.provider_id: r
                for r in Region.objects.filter(
                    code__startswith=region_code_prefix
                )
            }
        self.stdout.write(
            f"Regions: {len(codes_by_provider)} ensured ({len(to_create)} new)"
        )
        # Restrict to the providers we care about (in case --count shrank).
        return {pid: existing[pid] for pid in codes_by_provider if pid in existing}

    def _ensure_networks(
        self,
        bg: BusinessGroup,
        env: Environment,
        regions_by_provider_id: dict[int, Region],
    ):
        net_name_prefix = f"{BENCHMARK_SLUG_PREFIX}net-"
        target_names = {
            region.id: f"{net_name_prefix}{region.code.removeprefix(f'{BENCHMARK_SLUG_PREFIX}region-')}"
            for region in regions_by_provider_id.values()
        }
        # Filter on this BG only — that's already a tight scope; no IN clause.
        existing_region_ids = set(
            Network.objects.filter(
                business_group=bg, name__startswith=net_name_prefix
            ).values_list("region_id", flat=True)
        )
        to_create = [
            Network(
                name=name,
                cidr_block="10.0.0.0/16",
                region_id=region_id,
                environment=env,
                business_group=bg,
                is_active=True,
            )
            for region_id, name in target_names.items()
            if region_id not in existing_region_ids
        ]
        if to_create:
            Network.objects.bulk_create(
                to_create, batch_size=BATCH_SIZE, ignore_conflicts=True
            )
        self.stdout.write(
            f"Networks: {len(target_names)} ensured ({len(to_create)} new)"
        )
