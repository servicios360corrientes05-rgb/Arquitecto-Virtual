
import csv

# Rutas de entrada y salida
input_file = r"d:\DANIEL\Downloads\Antigravity\Proyectos\Arquitecto Virtual\tiendanube_raw.csv"
output_file = r"d:\DANIEL\Downloads\Antigravity\Proyectos\Arquitecto Virtual\shopify_import_ready.csv"

# Encabezados requeridos por Shopify
shopify_headers = [
    "Handle", "Title", "Body (HTML)", "Vendor", "Product Category", "Type", "Tags", "Published",
    "Option1 Name", "Option1 Value", "Option2 Name", "Option2 Value", "Option3 Name", "Option3 Value",
    "Variant SKU", "Variant Grams", "Variant Inventory Tracker", "Variant Inventory Qty",
    "Variant Inventory Policy", "Variant Fulfillment Service", "Variant Price", "Variant Compare At Price",
    "Variant Requires Shipping", "Variant Taxable", "Barcode", "Image Src", "Image Position",
    "Image Alt Text", "Gift Card", "SEO Title", "SEO Description",
    "Google Shopping / Google Product Category", "Google Shopping / Gender", "Google Shopping / Age Group",
    "Google Shopping / MPN", "Google Shopping / AdWords Grouping", "Google Shopping / AdWords Labels",
    "Google Shopping / Condition", "Google Shopping / Custom Product", "Google Shopping / Custom Label 0",
    "Google Shopping / Custom Label 1", "Google Shopping / Custom Label 2", "Google Shopping / Custom Label 3",
    "Google Shopping / Custom Label 4", "Variant Image", "Variant Weight Unit", "Tax 1 Name", "Tax 1 Type", "Tax 1 Value",
    "Tax 2 Name", "Tax 2 Type", "Tax 2 Value", "Tax 3 Name", "Tax 3 Type", "Tax 3 Value", "Cost per item", "Status"
]

def clean_price(price_str):
    if not price_str: return ""
    # Tiendanube Agentina: 39.088,58 -> Shopify: 39088.58
    # Paso 1: Eliminar el punto de miles
    clean = price_str.replace(".", "")
    # Paso 2: Reemplazar la coma decimal por punto
    clean = clean.replace(",", ".")
    return clean

def clean_handle(url_id):
    # Tiendanube handles are usually fine, but let's ensure they are clean
    return url_id.lower().strip()

rows = []

try:
    with open(input_file, 'r', encoding='latin-1') as f_in:
        reader = csv.DictReader(f_in, delimiter=';')
        
        for row in reader:
            new_row = {k: "" for k in shopify_headers}
            
            # Mapeo Básico
            new_row["Handle"] = clean_handle(row.get("Identificador de URL", ""))
            new_row["Title"] = row.get("Nombre", "")
            new_row["Body (HTML)"] = row.get("Descripcin", "") or row.get("Descripción", "")
            new_row["Vendor"] = row.get("Marca", "ArNeaz")
            new_row["Type"] = row.get("Categoras", "").split(">")[-1].strip() if row.get("Categoras") else ""
            new_row["Tags"] = row.get("Tags", "") + ", " + row.get("Categoras", "")
            new_row["Published"] = "TRUE" if row.get("Mostrar en tienda", "SI") == "SI" else "FALSE"
            new_row["Status"] = "active" if row.get("Mostrar en tienda", "SI") == "SI" else "draft"
            
            # Opciones / Variantes
            new_row["Option1 Name"] = row.get("Nombre de propiedad 1", "Title")
            new_row["Option1 Value"] = row.get("Valor de propiedad 1", "Default Title")
            new_row["Option2 Name"] = row.get("Nombre de propiedad 2", "")
            new_row["Option2 Value"] = row.get("Valor de propiedad 2", "")
            new_row["Option3 Name"] = row.get("Nombre de propiedad 3", "")
            new_row["Option3 Value"] = row.get("Valor de propiedad 3", "")
            
            if new_row["Option1 Name"] == "":
                 new_row["Option1 Name"] = "Title"
                 new_row["Option1 Value"] = "Default Title"

            # Precios y Stock
            # FORZAMOS PRECIO CERO para evitar errores de formato en importación inicial
            new_row["Variant Price"] = "0.00"
            new_row["Variant Compare At Price"] = ""
            new_row["Variant Inventory Qty"] = row.get("Stock", "0")
            new_row["Variant Inventory Tracker"] = "shopify"
            new_row["Variant Inventory Policy"] = "deny"
            new_row["Variant Fulfillment Service"] = "manual"
            
            new_row["Variant SKU"] = row.get("SKU", "")
            new_row["Barcode"] = row.get("Cdigo de barras", "")
            
            # Peso (kg a gramos)
            try:
                weight_kg = float(clean_price(row.get("Peso (kg)", "0")))
                new_row["Variant Grams"] = int(weight_kg * 1000)
            except:
                new_row["Variant Grams"] = 0
            new_row["Variant Weight Unit"] = "kg"

            new_row["Variant Requires Shipping"] = "TRUE"
            new_row["Variant Taxable"] = "TRUE"
            
            # SEO
            new_row["SEO Title"] = row.get("Ttulo para SEO", "")
            new_row["SEO Description"] = row.get("Descripcin para SEO", "")

            rows.append(new_row)

    # Escribir CSV para Shopify
    with open(output_file, 'w', encoding='utf-8', newline='') as f_out:
        writer = csv.DictWriter(f_out, fieldnames=shopify_headers)
        writer.writeheader()
        writer.writerows(rows)

    print(f"SUCCESS: Converted {len(rows)} products. File saved to: {output_file}")

except Exception as e:
    print(f"ERROR: {e}")
