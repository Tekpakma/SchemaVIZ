from django.apps import apps
from django.contrib import admin


for model in apps.get_app_config("stress_chain_zeta").get_models():
    try:
        admin.site.register(model)
    except admin.sites.AlreadyRegistered:
        pass
