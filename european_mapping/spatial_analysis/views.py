from django.shortcuts import render, get_object_or_404
from django.contrib.gis.db.models import Q
from django.contrib.gis.geos import Point
from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.measure import D
from .models import DublinAdminArea, DublinRoad, DublinPOI, LandUseZone


def spatial_analysis_dashboard(request):
    """Dashboard showing spatial analysis of Dublin data"""

    context = {
        'total_admin_areas': DublinAdminArea.objects.count(),
        'total_roads': DublinRoad.objects.count(),
        'total_pois': DublinPOI.objects.count(),
        'total_zones': LandUseZone.objects.count(),

        'admin_areas': DublinAdminArea.objects.all(),
        'major_roads': DublinRoad.objects.filter(
            road_type__in=['motorway', 'main_street']
        ).order_by('-speed_limit'),
        'attractions': DublinPOI.objects.filter(
            poi_type__in=['attraction', 'historic']
        ).order_by('-rating'),
        'zones': LandUseZone.objects.all(),
    }

    return render(request, 'spatial_analysis/dashboard.html', context)


def poi_detail(request, pk):
    """Detail view for a single POI"""
    poi = get_object_or_404(DublinPOI, pk=pk)

    # Find nearby roads within 1 km (1000m) and annotate distance in meters
    nearby_roads = (
        DublinRoad.objects.filter(geom__distance_lte=(poi.geom, D(m=1000)))
        .annotate(distance_m=Distance('geom', poi.geom))
        .order_by('distance_m')[:5]
    )

    context = {
        'poi': poi,
        'nearby_roads': nearby_roads,
        'poi_json': poi.geom.json,
    }

    return render(request, 'spatial_analysis/poi_details.html', context)