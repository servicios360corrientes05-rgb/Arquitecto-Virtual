
import csv

file_path = r"d:\DANIEL\Downloads\Antigravity\Proyectos\Arquitecto Virtual\tiendanube_raw.csv"

try:
    with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
        # Tiendanube usually uses semicolon
        reader = csv.reader(f, delimiter=';')
        headers = next(reader)
        print("COLUMNS FOUND:")
        for i, h in enumerate(headers):
            print(f"{i}: {h}")
except Exception as e:
    print(f"Error reading with utf-8: {e}")
    # Try messy latin-1 if utf-8 fails
    try:
        with open(file_path, 'r', encoding='latin-1') as f:
            reader = csv.reader(f, delimiter=';')
            headers = next(reader)
            print("COLUMNS FOUND (Latin-1):")
            for i, h in enumerate(headers):
                print(f"{i}: {h}")
    except Exception as e2:
        print(f"Error with latin-1: {e2}")
