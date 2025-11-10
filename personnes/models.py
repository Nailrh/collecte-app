from django.db import models
class Personne(models.Model):
    nom = models.CharField(max_length=100)
    prenom = models.CharField(max_length=100)
    date_naissance = models.DateField()
    pays = models.CharField(max_length=100)
    region = models.CharField(max_length=100)
    district = models.CharField(max_length=100)
    commune = models.CharField(max_length=100)
    village = models.CharField(max_length=100)
    adresse = models.TextField()

    def __str__(self):
        return f"{self.nom} {self.prenom}"

class Numero(models.Model):
    personne = models.ForeignKey(Personne, on_delete=models.CASCADE, related_name='numeros')
    numero = models.CharField(max_length=20)

    def __str__(self):
        return self.numero