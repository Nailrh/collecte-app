from django import forms
from django.forms import inlineformset_factory
from .models import Personne, Numero

class PersonneForm(forms.ModelForm):
    class Meta:
        model = Personne
        fields = [
            'nom', 'prenom', 'date_naissance', 'pays', 'region',
            'district', 'commune', 'village', 'adresse'
        ]
        widgets = {
            'nom': forms.TextInput(attrs={
                'class': 'form-control',
                'oninput': 'this.value = this.value.toUpperCase()'
            }),
            'prenom': forms.TextInput(attrs={'class': 'form-control'}),
            'date_naissance': forms.DateInput(attrs={'class': 'form-control', 'type': 'date'}),
            'pays': forms.TextInput(attrs={'class': 'form-control'}),
            'region': forms.TextInput(attrs={'class': 'form-control'}),
            'district': forms.TextInput(attrs={'class': 'form-control'}),
            'commune': forms.TextInput(attrs={'class': 'form-control'}),
            'village': forms.TextInput(attrs={'class': 'form-control'}),
            'adresse': forms.Textarea(attrs={'class': 'form-control', 'rows': 2}),
        }

class NumeroForm(forms.ModelForm):
    class Meta:
        model = Numero
        fields = ['numero']
        widgets = {
            'numero': forms.TextInput(attrs={
                'class': 'form-control',
                'type': 'tel',
                'pattern': '[0-9]{7,20}',
                'inputmode': 'numeric',
                'placeholder': 'Ex: 0331234567'
            }),
        }

    def clean_numero(self):
        raw = self.cleaned_data.get('numero') or ''
        digits = ''.join(ch for ch in raw if ch.isdigit())
        if not digits:
            raise forms.ValidationError('Numéro vide')
        if len(digits) < 7:
            raise forms.ValidationError('Numéro trop court')
        if len(digits) > 20:
            raise forms.ValidationError('Numéro trop long')
        return digits

NumeroFormSet = inlineformset_factory(
    parent_model=Personne,
    model=Numero,
    form=NumeroForm,
    fields=('numero',),
    extra=1,
    can_delete=True
)