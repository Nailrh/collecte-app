"""URL configuration for collecte_app project."""

from django.contrib import admin
from django.urls import path, include
from django.views import View
from django.http import FileResponse, Http404
from django.conf import settings
import os

# Serve service-worker.js from static/service-worker.js at root path
class ServiceWorkerView(View):
    def get(self, request, *args, **kwargs):
        sw_path = os.path.join(settings.BASE_DIR, 'static', 'service-worker.js')
        if not os.path.exists(sw_path):
            raise Http404("service-worker.js not found")
        return FileResponse(open(sw_path, 'rb'), content_type='application/javascript')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('personnes.urls')),  # tes views sont dans personnes/views.py
    path('service-worker.js', ServiceWorkerView.as_view(), name='service-worker'),
]
