# personnes/urls.py
from django.urls import path
from django.http import HttpResponseServerError
import importlib
import traceback

def make_error_view(msg):
    def _view(request, *args, **kwargs):
        body = (
            "<h1>Import error in personnes.views</h1>"
            "<pre style='white-space:pre-wrap; font-family: monospace;'>%s</pre>"
        ) % (msg,)
        return HttpResponseServerError(body)
    return _view

try:
    views = importlib.import_module('personnes.views')
    required = [
        'home',
        'liste_personnes',
        'ajouter_personne',
        'detail_personne',
        'modifier_personne',
        'supprimer_personne',
    ]
    for name in required:
        if not hasattr(views, name):
            setattr(views, name, make_error_view(f"View '{name}' not found in personnes.views"))
except Exception:
    tb = traceback.format_exc()
    class _DummyViews:
        pass
    views = _DummyViews()
    views.home = make_error_view(tb)
    views.liste_personnes = make_error_view(tb)
    views.ajouter_personne = make_error_view(tb)
    views.detail_personne = make_error_view(tb)
    views.modifier_personne = make_error_view(tb)
    views.supprimer_personne = make_error_view(tb)

urlpatterns = [
    path('', views.home, name='home'),
    path('liste/', views.liste_personnes, name='liste_personnes'),
    path('ajouter/', views.ajouter_personne, name='ajouter_personne'),
    path('personne/<int:pk>/', views.detail_personne, name='detail_personne'),
    path('modifier/<int:pk>/', views.modifier_personne, name='modifier_personne'),
    path('supprimer/<int:pk>/', views.supprimer_personne, name='supprimer_personne'),
]
