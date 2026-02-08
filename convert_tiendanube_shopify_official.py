
import csv

# Rutas de entrada y salida
input_file = r"d:\DANIEL\Downloads\Antigravity\Proyectos\Arquitecto Virtual\tiendanube_raw.csv"
output_file = r"d:\DANIEL\Downloads\Antigravity\Proyectos\Arquitecto Virtual\shopify_import_ready_official.csv"

# Encabezados EXACTOS de la plantilla oficial de Shopify
shopify_headers = [
    "Title", "URL handle", "Description", "Vendor", "Product category", "Type", "Tags", 
    "Published on online store", "Status", "SKU", "Barcode", "Option1 name", "Option1 value", 
    "Option2 name", "Option2 value", "Option3 name", "Option3 value", "Price", "Compare-at price", 
    "Cost per item", "Charge tax", "Tax code", "Unit price total measure", 
    "Unit price total measure unit", "Unit price base measure", "Unit price base measure unit", 
    "Inventory tracker", "Inventory quantity", "Continue selling when out of stock", 
    "Weight value (grams)", "Weight unit for display", "Requires shipping", "Fulfillment service", 
    "Product image URL", "Image position", "Image alt text", "Variant image URL", "Gift card", 
    "SEO title", "SEO description", "Google Shopping / Google product category", 
    "Google Shopping / Gender", "Google Shopping / Age group", "Google Shopping / MPN", 
    "Google Shopping / AdWords Grouping", "Google Shopping / AdWords labels", 
    "Google Shopping / Condition", "Google Shopping / Custom product", 
    "Google Shopping / Custom label 0", "Google Shopping / Custom label 1", 
    "Google Shopping / Custom label 2", "Google Shopping / Custom label 3", 
    "Google Shopping / Custom label 4"
]

def clean_price(price_str):
    if not price_str: return ""
    # Tiendanube Agentina: 39.088,58 -> Shopify: 39088.58
    clean = price_str.replace(".", "")
    clean = clean.replace(",", ".")
    return clean

def clean_handle(url_id):
    return url_id.lower().strip()

rows = []

try:
    with open(input_file, 'r', encoding='latin-1') as f_in:
        reader = csv.DictReader(f_in, delimiter=';')
        
        for row in reader:
            new_row = {k: "" for k in shopify_headers}
            
            # Mapeo Principal
            new_row["URL handle"] = clean_handle(row.get("Identificador de URL", ""))
            new_row["Title"] = row.get("Nombre", "")
            new_row["Description"] = row.get("Descripcin", "") or row.get("Descripción", "")
            new_row["Vendor"] = row.get("Marca", "ArNeaz")
            new_row["Type"] = row.get("Categoras", "").split(">")[-1].strip() if row.get("Categoras") else ""
            new_row["Tags"] = row.get("Tags", "") + ", " + row.get("Categoras", "")
            
            # Status
            is_published = row.get("Mostrar en tienda", "SI") == "SI"
            new_row["Published on online store"] = "TRUE" if is_published else "FALSE"
            new_row["Status"] = "active" if is_published else "draft"
            
            # Opciones
            new_row["Option1 name"] = row.get("Nombre de propiedad 1", "Title") or "Title"
            new_row["Option1 value"] = row.get("Valor de propiedad 1", "Default Title") or "Default Title"
            new_row["Option2 name"] = row.get("Nombre de propiedad 2", "")
            new_row["Option2 value"] = row.get("Valor de propiedad 2", "")
            new_row["Option3 name"] = row.get("Nombre de propiedad 3", "")
            new_row["Option3 value"] = row.get("Valor de propiedad 3", "")
            
            # Precios (FORZADO A 0.00 por seguridad)
            new_row["Price"] = "0.00" 
            new_row["Compare-at price"] = "" # Dejar vacio para evitar errores
            new_row["Cost per item"] = ""
            
            # Inventario y Logística
            new_row["Inventory quantity"] = row.get("Stock", "0")
            new_row["Inventory tracker"] = "shopify"
            new_row["Continue selling when out of stock"] = "deny"
            new_row["Fulfillment service"] = "manual"
            new_row["SKU"] = row.get("SKU", "")
            new_row["Barcode"] = row.get("Cdigo de barras", "")
            
            # Peso
            try:
                weight_kg = float(clean_price(row.get("Peso (kg)", "0")))
                new_row["Weight value (grams)"] = int(weight_kg * 1000)
            except:
                new_row["Weight value (grams)"] = 0
            new_row["Weight unit for display"] = "kg"

            new_row["Requires shipping"] = "TRUE"
            new_row["Charge tax"] = "FALSE" # Simplificación inicial
            
            # SEO
            new_row["SEO title"] = row.get("Ttulo para SEO", "")
            new_row["SEO description"] = row.get("Descripcin para SEO", "")

            rows.append(new_row)

    # Escribir CSV Oficial
    with open(output_file, 'w', encoding='utf-8', newline='') as f_out:
        writer = csv.DictWriter(f_out, fieldnames=shopify_headers)
        writer.writeheader()
        writer.writerows(rows)

    print(f"SUCCESS: Converted {len(rows)} products using OFFICIAL TEMPLATE format. File saved to: {output_file}")

except Exception as e:
    print(f"ERROR: {e}")
