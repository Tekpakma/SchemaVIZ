from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from django_schema_viz.models import TourDefinition, TourProgress

User = get_user_model()


class TourProgressViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="tour-user", email="tour@example.com")
        self.other_user = User.objects.create_user(
            username="tour-other", email="other@example.com"
        )
        self.tour_v1, _ = TourDefinition.objects.get_or_create(
            key="canvas-onboarding",
            version=1,
            defaults={
                "is_active": True,
            },
        )
        self.tour_v2 = TourDefinition.objects.create(
            key="canvas-onboarding",
            version=2,
            is_active=True,
        )
        self.url = "/schema-viz/tours/canvas-onboarding/progress/"

    def test_requires_authentication(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 401)

    def test_get_creates_default_progress_for_latest_active_version(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)

        body = response.json()
        self.assertEqual(body["key"], "canvas-onboarding")
        self.assertEqual(body["version"], 2)
        self.assertEqual(body["progress"]["status"], TourProgress.STATUS_NOT_STARTED)
        self.assertEqual(body["progress"]["currentStep"], 0)
        self.assertEqual(body["progress"]["highestStep"], 0)

        self.assertEqual(
            TourProgress.objects.filter(user=self.user, tour=self.tour_v2).count(),
            1,
        )

    def test_put_updates_progress_and_completion_timestamp(self):
        self.client.force_authenticate(self.user)
        response = self.client.put(
            self.url,
            {
                "status": TourProgress.STATUS_IN_PROGRESS,
                "currentStep": 3,
                "highestStep": 3,
                "metadata": {"source": "driver-js"},
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["progress"]["status"], TourProgress.STATUS_IN_PROGRESS)
        self.assertEqual(response.json()["progress"]["currentStep"], 3)
        self.assertEqual(response.json()["progress"]["highestStep"], 3)

        progress = TourProgress.objects.get(user=self.user, tour=self.tour_v2)
        self.assertIsNotNone(progress.started_at)
        self.assertIsNone(progress.completed_at)

        response = self.client.put(
            self.url,
            {
                "status": TourProgress.STATUS_COMPLETED,
                "currentStep": 6,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        progress.refresh_from_db()
        self.assertEqual(progress.status, TourProgress.STATUS_COMPLETED)
        self.assertEqual(progress.current_step, 6)
        self.assertEqual(progress.highest_step, 6)
        self.assertIsNotNone(progress.completed_at)

    def test_progress_is_scoped_per_user(self):
        TourProgress.objects.create(
            user=self.other_user,
            tour=self.tour_v2,
            status=TourProgress.STATUS_IN_PROGRESS,
            current_step=4,
            highest_step=4,
        )

        self.client.force_authenticate(self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["progress"]["currentStep"], 0)


class TourProgressListViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="tour-list", email="tour-list@example.com")
        self.other_user = User.objects.create_user(
            username="tour-list-other", email="tour-list-other@example.com"
        )
        self.canvas_key = "canvas-onboarding-list"
        self.schema_key = "schema-workflow-list"
        self.retired_key = "retired-tour-list"
        self.canvas_v1 = TourDefinition.objects.create(
            key=self.canvas_key,
            version=1,
            is_active=True,
        )
        self.canvas_v2 = TourDefinition.objects.create(
            key=self.canvas_key,
            version=2,
            is_active=True,
        )
        self.schema_tour = TourDefinition.objects.create(
            key=self.schema_key,
            version=1,
            is_active=True,
        )
        self.inactive_tour = TourDefinition.objects.create(
            key=self.retired_key,
            version=1,
            is_active=False,
        )
        TourProgress.objects.create(
            user=self.user,
            tour=self.canvas_v2,
            status=TourProgress.STATUS_IN_PROGRESS,
            current_step=3,
            highest_step=4,
        )
        TourProgress.objects.create(
            user=self.other_user,
            tour=self.schema_tour,
            status=TourProgress.STATUS_COMPLETED,
            current_step=8,
            highest_step=8,
        )
        self.url = "/schema-viz/tours/progress/"

    def test_requires_authentication(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 401)

    def test_list_returns_latest_active_tours_with_user_scoped_progress(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)

        body = response.json()

        by_key = {item["key"]: item for item in body}
        self.assertEqual(by_key[self.canvas_key]["version"], 2)
        self.assertEqual(
            by_key[self.canvas_key]["progress"]["status"],
            TourProgress.STATUS_IN_PROGRESS,
        )
        self.assertEqual(by_key[self.canvas_key]["progress"]["currentStep"], 3)

        self.assertEqual(by_key[self.schema_key]["version"], 1)
        self.assertEqual(
            by_key[self.schema_key]["progress"]["status"],
            TourProgress.STATUS_NOT_STARTED,
        )
        self.assertEqual(by_key[self.schema_key]["progress"]["currentStep"], 0)

        self.assertNotIn(self.retired_key, by_key)

    def test_list_creates_default_progress_for_missing_tours(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)

        self.assertTrue(
            TourProgress.objects.filter(user=self.user, tour=self.schema_tour).exists()
        )
