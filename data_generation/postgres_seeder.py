import os
import random
from itertools import product
from decimal import Decimal
from datetime import date, datetime, timedelta, timezone

import psycopg2
from faker import Faker
from psycopg2.extras import execute_values

# Prefer env vars so credentials are never committed. Defaults suit Postgres.app local trust auth.
DB_HOST = os.environ.get("STAYSPOT_PG_HOST", "localhost")
DB_NAME = os.environ.get("STAYSPOT_PG_DB", "stayspot")
DB_USER = os.environ.get("STAYSPOT_PG_USER", os.environ.get("USER", "postgres"))
DB_PASSWORD = os.environ.get("STAYSPOT_PG_PASSWORD", "")
DB_PORT = os.environ.get("STAYSPOT_PG_PORT", "5432")

GUEST_COUNT = 10_000
PROPERTY_COUNT = 5_000
BOOKING_COUNT = 100_000

random.seed(42)
fake = Faker()
fake.seed_instance(42)


NAMES = (
    "Willow", "Cedar", "Maple", "Juniper", "Laurel", "Magnolia", "Aspen",
    "Birch", "Elm", "Oak", "Olive", "Hazel", "Rowan", "Linden", "Alder",
    "Ivy", "Jasmine", "Clover", "Fern", "Sage", "Rose", "Dahlia", "Iris",
    "Camellia", "Wisteria",
)
SETTINGS = (
    "Courtyard", "Grove", "Terrace", "Mews", "Lane", "Place", "Court",
    "Square", "Walk", "Park", "Circle", "Crescent", "Gardens", "Row",
    "Way", "Corner", "Close", "Avenue", "Commons", "Heights", "Gate",
    "Haven", "Nook", "Retreat", "House",
)
STAY_TYPES = (
    "Apartment", "Studio", "Loft", "Suite", "Townhouse", "Cottage",
    "Residence", "Flat",
)


def generate_property_names(count, seed=42):
    """Return unique names without numeric suffixes or real-location claims."""
    names = [f"{name} {setting} {kind}" for name, setting, kind
             in product(NAMES, SETTINGS, STAY_TYPES)]
    if not 0 <= count <= len(names):
        raise ValueError(f"Choose between 0 and {len(names)} property names.")
    random.Random(seed).shuffle(names)
    return names[:count]


def connect():
    kwargs = {
        "host": DB_HOST,
        "port": DB_PORT,
        "dbname": DB_NAME,
        "user": DB_USER,
    }
    if DB_PASSWORD:
        kwargs["password"] = DB_PASSWORD
    return psycopg2.connect(**kwargs)


def generate_data():
    conn = connect()
    cur = conn.cursor()

    cur.execute("SELECT EXISTS (SELECT 1 FROM guests)")
    if cur.fetchone()[0]:
        raise RuntimeError("Refusing to append seed data: guests already exist. Use an empty database.")

    print("Inserting guests...")
    guest_rows = [
        (fake.name(), round(random.uniform(1000, 10000), 2))
        for _ in range(GUEST_COUNT)
    ]
    guest_ids = execute_values(
        cur,
        "INSERT INTO guests (name, wallet_balance) VALUES %s RETURNING id, wallet_balance",
        guest_rows,
        fetch=True,
    )
    conn.commit()
    print(f"Inserted {len(guest_ids)} guests.")

    print("Inserting properties...")
    property_rows = [
        (
            title,
            round(random.uniform(50, 200), 2),
            random.uniform(40.70, 40.80),
            random.uniform(-74.05, -73.85),
        )
        for title in generate_property_names(PROPERTY_COUNT)
    ]
    property_ids = execute_values(
        cur,
        "INSERT INTO properties (title, base_price, latitude, longitude) VALUES %s RETURNING id, base_price",
        property_rows,
        fetch=True,
    )
    conn.commit()
    print(f"Inserted {len(property_ids)} properties.")

    guests = [[row[0], Decimal(row[1])] for row in guest_ids]
    properties = [(row[0], Decimal(row[1])) for row in property_ids]
    checked_in = set()

    print("Inserting bookings and updating wallets...")
    inserted = 0
    while inserted < BOOKING_COUNT:
        check_in = date.today() + timedelta(days=random.randint(1, 30))
        check_out = check_in + timedelta(days=random.randint(2, 7))
        g_idx = random.randrange(len(guests))
        guest_id, balance = guests[g_idx]
        property_id, base_price = random.choice(properties)
        nights = (check_out - check_in).days
        total_cost = (base_price * nights).quantize(Decimal("0.01"))

        if balance < total_cost:
            # Top-ups go through the same audit trigger and guarantee progress.
            cur.execute("UPDATE guests SET wallet_balance = wallet_balance + 10000 WHERE id = %s", (guest_id,))
            balance += Decimal("10000")

        if guest_id not in checked_in and random.random() < 0.02:
            status = "CHECKED_IN"
            checked_in.add(guest_id)
        elif random.random() < 0.5:
            status = "COMPLETED"
        else:
            status = "CONFIRMED"

        cur.execute(
            "UPDATE guests SET wallet_balance = wallet_balance - %s WHERE id = %s",
            (total_cost, guest_id),
        )
        cur.execute(
            """INSERT INTO bookings
            (guest_id, property_id, check_in, check_out, total_cost, status, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (guest_id, property_id, check_in, check_out, total_cost, status,
             datetime.now(timezone.utc) - timedelta(days=random.randint(0, 59))),
        )
        guests[g_idx][1] = balance - total_cost
        inserted += 1

        if inserted % 1000 == 0:
            conn.commit()
            print(f"Inserted {inserted} bookings...")

    conn.commit()
    print(f"Inserted {inserted} bookings.")

    cur.execute("SELECT COUNT(*) FROM guests")
    print("Guests:", cur.fetchone()[0])
    cur.execute("SELECT COUNT(*) FROM properties")
    print("Properties:", cur.fetchone()[0])
    cur.execute("SELECT COUNT(*) FROM bookings")
    print("Bookings:", cur.fetchone()[0])
    cur.execute("SELECT COUNT(*) FROM wallet_audit_logs")
    print("Wallet Audit Logs:", cur.fetchone()[0])

    cur.close()
    conn.close()


if __name__ == "__main__":
    generate_data()
