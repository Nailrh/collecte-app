# personnes/views.py
from django.shortcuts import render, redirect, get_object_or_404
from .models import Personne, Numero
from .forms import PersonneForm
from django.utils.timezone import now

from django.shortcuts import get_object_or_404, redirect, render
from django.db import transaction
from .models import Personne, Numero
from .forms import PersonneForm, NumeroFormSet

def home(request):
    total_personnes = Personne.objects.count()
    total_fiches = Personne.objects.exclude(adresse='').count()
    nouveaux = Personne.objects.count()

    context = {
        'total_personnes': total_personnes,
        'total_fiches': total_fiches,
        'nouveaux': total_personnes,
    }
    return render(request, 'personnes/home.html', context)


def liste_personnes(request):
    query = request.GET.get('q')
    if query:
        personnes = Personne.objects.filter(nom__icontains=query) | Personne.objects.filter(numeros__numero__icontains=query)
    else:
        personnes = Personne.objects.all()
    return render(request, 'personnes/liste.html', {'personnes': personnes})

def detail_personne(request, pk):
    personne = get_object_or_404(Personne, pk=pk)
    return render(request, 'personnes/detail.html', {'personne': personne})

def ajouter_personne(request):
    if request.method == 'POST':
        form = PersonneForm(request.POST)
        if form.is_valid():
            personne = form.save()
            for key in request.POST:
                if key.startswith('numero_'):
                    numero_val = request.POST[key]
                    if numero_val.strip():
                        Numero.objects.create(personne=personne, numero=numero_val)
            return redirect('liste_personnes')
    else:
        form = PersonneForm()
    return render(request, 'personnes/ajout.html', {'form': form})

def modifier_personne(request, pk):
    personne = get_object_or_404(Personne, pk=pk)

    # 🔧 Correction : forcer le format ISO pour le champ date
    if personne.date_naissance:
        personne.date_naissance = personne.date_naissance.strftime('%Y-%m-%d')

    if request.method == 'POST':
        form = PersonneForm(request.POST, instance=personne)
        erreurs = []
        numeros_valides = []

        for key in request.POST:
            if key.startswith('numero_'):
                val = request.POST[key].strip()
                if not val:
                    erreurs.append(f"Le champ {key} est obligatoire.")
                elif not val.isdigit() or len(val) < 7:
                    erreurs.append(f"Le champ {key} est invalide.")
                else:
                    numeros_valides.append(val)

        if form.is_valid() and not erreurs:
            personne = form.save()
            personne.numeros.all().delete()
            for numero in numeros_valides:
                Numero.objects.create(personne=personne, numero=numero)
            return redirect('liste_personnes')
        else:
            return render(request, 'personnes/modifier.html', {
                'form': form,
                'numeros': list(personne.numeros.values_list('numero', flat=True)),
                'erreurs': erreurs,
            })

    else:
        form = PersonneForm(instance=personne)
        return render(request, 'personnes/modifier.html', {
            'form': form,
            'numeros': list(personne.numeros.values_list('numero', flat=True)),
        })
    
def supprimer_personne(request, pk):
    personne = get_object_or_404(Personne, pk=pk)
    if request.method == 'POST':
        personne.delete()
        return redirect('liste_personnes')

    return render(request, 'personnes/supprimer.html', {'personne': personne})
