"""
URL configuration for collecte_app project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
# personnes/urls.py
from django.urls import path
from django.views import View
from django.http import FileResponse, Http404
import os
from django.conf import settings

class ServiceWorkerView(View):
    def get(self, request, *args, **kwargs):
        path = os.path.join(settings.BASE_DIR, 'static', 'service-worker.js')
        if not os.path.exists(path):
            raise Http404("service-worker.js not found")
        return FileResponse(open(path, 'rb'), content_type='application/javascript')
        
urlpatterns = [
    path('', views.home, name='home'),
    path('liste/', views.liste_personnes, name='liste_personnes'),
    path('ajouter/', views.ajouter_personne, name='ajouter_personne'),
    path('personne/<int:pk>/', views.detail_personne, name='detail_personne'),
    path('modifier/<int:pk>/', views.modifier_personne, name='modifier_personne'),
    path('supprimer/<int:pk>/', views.supprimer_personne, name='supprimer_personne'),
    path('service-worker.js', ServiceWorkerView.as_view(), name='service-worker'),
] 


