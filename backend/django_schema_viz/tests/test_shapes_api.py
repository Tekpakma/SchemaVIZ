from rest_framework.test import APITestCase


class ShapesListViewTests(APITestCase):
    url = "/schema-viz/shapes/"

    def test_returns_200(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)

    def test_response_contains_shapes_and_aliases(self):
        payload = self.client.get(self.url).json()
        self.assertIn("shapes", payload)
        self.assertIn("aliases", payload)
        self.assertIsInstance(payload["shapes"], list)
        self.assertIsInstance(payload["aliases"], dict)

    def test_contains_all_registered_shapes(self):
        payload = self.client.get(self.url).json()
        keys = [s["key"] for s in payload["shapes"]]
        self.assertIn("default", keys)
        self.assertIn("cloud", keys)
        self.assertIn("cylinder", keys)
        self.assertIn("server", keys)

    def test_shape_fields_are_camel_case(self):
        payload = self.client.get(self.url).json()
        shape = payload["shapes"][0]
        self.assertIn("key", shape)
        self.assertIn("label", shape)
        self.assertIn("defaultWidth", shape)
        self.assertIn("defaultHeight", shape)
        self.assertIn("category", shape)
        self.assertIn("svgViewbox", shape)
        self.assertIn("svgStrokeWidth", shape)
        self.assertIn("svgElements", shape)

    def test_cloud_shape_has_svg_elements(self):
        payload = self.client.get(self.url).json()
        cloud = next(s for s in payload["shapes"] if s["key"] == "cloud")
        self.assertEqual(len(cloud["svgElements"]), 1)
        self.assertEqual(cloud["svgElements"][0]["tag"], "path")
        self.assertIn("d", cloud["svgElements"][0]["attrs"])

    def test_cylinder_shape_has_svg_elements(self):
        payload = self.client.get(self.url).json()
        cylinder = next(s for s in payload["shapes"] if s["key"] == "cylinder")
        self.assertEqual(len(cylinder["svgElements"]), 7)

    def test_server_shape_has_svg_elements(self):
        payload = self.client.get(self.url).json()
        server = next(s for s in payload["shapes"] if s["key"] == "server")
        self.assertEqual(len(server["svgElements"]), 6)
        self.assertEqual(server["svgElements"][0]["tag"], "rect")

    def test_default_shape_has_no_svg_elements(self):
        payload = self.client.get(self.url).json()
        default = next(s for s in payload["shapes"] if s["key"] == "default")
        self.assertEqual(len(default["svgElements"]), 0)
        self.assertIsNone(default["svgViewbox"])

    def test_aliases_contains_database_to_cylinder(self):
        payload = self.client.get(self.url).json()
        self.assertEqual(payload["aliases"].get("database"), "cylinder")

    def test_svg_element_fields_are_camel_case(self):
        payload = self.client.get(self.url).json()
        cloud = next(s for s in payload["shapes"] if s["key"] == "cloud")
        el = cloud["svgElements"][0]
        self.assertIn("tag", el)
        self.assertIn("attrs", el)
        self.assertIn("fillMode", el)
        self.assertIn("strokeMode", el)
        self.assertIn("strokeDasharray", el)
