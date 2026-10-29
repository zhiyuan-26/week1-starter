from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.gis.geos import Point
from cities_api.models import City

# Create your tests here.
class SpatialAPITests(APITestCase):
    def setUp(self):
        # Create sample spatial cities for testing
        self.dublin = City.objects.create(
            name="Dublin",
            country="Ireland",
            population=1173179,
            location=Point(-6.2603, 53.3498, srid=4326)
        )
        self.cork = City.objects.create(
            name="Cork",
            country="Ireland",
            population=222333,
            location=Point(-8.4756, 51.8985, srid=4326) # ~220 km from Dublin
        )
        self.belfast = City.objects.create(
            name="Belfast",
            country="United Kingdom",
            population=343542,
            location=Point(-5.9301, 54.5973, srid=4326) # ~140 km from Dublin
        )

        self.nearest_url = reverse('cities_api:find_nearest_cities')
        self.radius_url = reverse('cities_api:cities_within_radius')

    # Valid Nearest City Request
    def test_nearest_cities_valid(self):
        payload = {"lat": 53.3498, "lng": -6.2603}
        response = self.client.post(self.nearest_url, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('nearest_cities', response.data)
        self.assertGreater(len(response.data['nearest_cities']), 0)

        # First city returned shoud be Dublin itself (0 km distance)
        self.assertEqual(response.data['nearest_cities'][0]['name'], "Dublin")
        self.assertEqual(response.data['nearest_cities'][0]['rank'], 1)

    # Valid Radius Request
    def test_radius_cities_valid(self):
        payload = {"lat": 53.3498, "lng": -6.2603, "radius_km": 160}
        response = self.client.post(self.radius_url, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('cities', response.data)
        city_names = [c['name'] for c in response.data['cities']]

        # Dublin (0 km) and Belfast (~140 km) fall within 160 km, Cork (~220 km) does not
        self.assertIn('Dublin', city_names)
        self.assertIn('Belfast', city_names)
        self.assertNotIn('Cork', city_names)

    # Invalid Coordinates Ranges
    def test_invalid_coordinates_ranges(self):
        invalid_payloads = [
            {"lat": 95.0, "lng": -6.2603},   # Lat > 90
            {"lat": -95.0, "lng": -6.2603},  # Lat < -90
            {"lat": 53.3498, "lng": 185.0},  # Lng > 180
            {"lat": 53.3498, "lng": -185.0}  # Lng < -180
        ]

        for payload in invalid_payloads:
            response = self.client.post(self.nearest_url, payload, format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn('error', response.data)

    # Missing or Non-Numeric Inputs
    def test_missing_or_non_numeric_inputs(self):
        invalid_payloads = [
            {},                             # Missing all
            {"lat": 53.3498},               # Missing lng
            {"lat": "invalid", "lng": -6.2},# Non-numeric lat
            {"lat": 53.3498, "lng": "abc"}  # Non-numeric lng
        ]
        for payload in invalid_payloads:
            response = self.client.post(self.nearest_url, payload, format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn('error', response.data)

    # Invalid Radius
    def test_invalid_radius_values(self):
        invalid_radius = [
            {"lat": 53.3498, "lng": -6.2603, "radius_km": 0},      # Radius = 0
            {"lat": 53.3498, "lng": -6.2603, "radius_km": -50},    # Negative radius
            {"lat": 53.3498, "lng": -6.2603, "radius_km": 25000},  # Radius > 20,000
            {"lat": 53.3498, "lng": -6.2603, "radius_km": "invalid"}# Non-numeric radius
        ]
        
        for payload in invalid_radius:
            response = self.client.post(self.radius_url, payload, format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn('error', response.data)