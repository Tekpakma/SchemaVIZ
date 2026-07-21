from django.test import RequestFactory, SimpleTestCase, override_settings

from test_project.middleware import DevelopmentCsrfViewMiddleware


class DevelopmentCsrfViewMiddlewareTests(SimpleTestCase):
    def setUp(self):
        self.middleware = DevelopmentCsrfViewMiddleware(lambda request: None)
        self.factory = RequestFactory()

    def make_request(self):
        return self.factory.post(
            "/schema-viz/api/test/",
            HTTP_HOST="testserver",
            HTTP_ORIGIN="http://localhost:3001",
        )

    @override_settings(DEBUG=True, CSRF_TRUSTED_ORIGINS=[])
    def test_debug_allows_untrusted_local_development_origin(self):
        self.assertTrue(self.middleware._origin_verified(self.make_request()))

    @override_settings(
        ALLOWED_HOSTS=["testserver"],
        CSRF_TRUSTED_ORIGINS=[],
        DEBUG=False,
    )
    def test_non_debug_keeps_django_origin_verification(self):
        self.assertFalse(self.middleware._origin_verified(self.make_request()))