from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("portal", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="CustomerAccess",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("customer", models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name="access", to="portal.customer")),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="portal_customer", to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
