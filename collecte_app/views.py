from django.http import HttpResponse
from personnes.models import Personne

def home(request):
    return HttpResponse("Bienvenue")