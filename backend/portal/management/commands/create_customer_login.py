from getpass import getpass

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from portal.models import Customer, CustomerAccess


class Command(BaseCommand):
    help = "Create a login linked to an existing synthetic bank customer."

    def add_arguments(self, parser):
        parser.add_argument("customer_code")
        parser.add_argument("username")

    @transaction.atomic
    def handle(self, *args, **options):
        User = get_user_model()
        code = options["customer_code"].strip().upper()
        username = options["username"].strip()

        if not username:
            raise CommandError("Username cannot be empty.")

        try:
            customer = Customer.objects.get(code=code)
        except Customer.DoesNotExist:
            raise CommandError(f"Customer {code} does not exist.")

        if CustomerAccess.objects.filter(customer=customer).exists():
            raise CommandError(f"Customer {code} already has a login.")

        if User.objects.filter(username=username).exists():
            raise CommandError("That username is already in use.")

        password = getpass("New password: ")
        confirm = getpass("Confirm password: ")

        if not password or len(password) < 12:
            raise CommandError("Password must contain at least 12 characters.")

        if password != confirm:
            raise CommandError("Passwords do not match.")

        user = User.objects.create_user(username=username, password=password)

        CustomerAccess.objects.create(user=user, customer=customer)

        self.stdout.write(self.style.SUCCESS(
            f"Customer login created: {username} -> {customer.code} ({customer.name})"
        ))
