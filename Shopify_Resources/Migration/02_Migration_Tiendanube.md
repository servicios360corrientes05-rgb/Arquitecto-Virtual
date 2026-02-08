# Migración: Tiendanube a Shopify

## Estrategia General
No existe una herramienta oficial "directa" de un solo clic para Tiendanube, por lo que se recomienda el método de **Archivos CSV** o Apps de terceros.

## Método 1: Manual (Archivos CSV) - Recomendado
1. **Exportar desde Tiendanube**:
    - Ve a tu panel de Tiendanube.
    - Exporta tus Productos, Clientes y Órdenes a CSV.
2. **Preparar el CSV para Shopify**:
    - Descarga la plantilla CSV de productos de Shopify.
    - Mapea las columnas de Tiendanube a las de Shopify.
    - **Importante**: Ajusta los `Handles` (URLs) para que sean limpios.
    - Asegura que las imágenes sean URLs públicas accesibles.
3. **Importar en Shopify**:
    - Usa la herramienta nativa "Store Importer" o ve a "Products > Import".
    - Sube el archivo CSV modificado.

## Método 2: Apps de Migración (Automatizado)
Herramientas como **Cart2Cart**, **LitExtension** o **Matrixify** pueden automatizar el proceso conectándose a ambas plataformas.
- **Ventajas**: Migran imágenes, categorías y variantes complejas automáticamente.
- **Desventajas**: Tienen un costo asociado al volumen de datos.

## Consideraciones SEO (Crítico)
- **Redirecciones 301**:
    - Al cambiar de plataforma, las URLs de tus productos cambiarán.
    - Debes crear redirecciones 301 en Shopify (`Online Store > Navigation > URL Redirects`) desde la URL vieja de Tiendanube a la nueva de Shopify para no perder posicionamiento en Google.
- Títulos y Meta Descripciones: Asegúrate de migrarlos en el CSV.

## Checklist Post-Migración
- Verificar variantes y precios.
- Probar el proceso de checkout completo.
- Re-conectar dominio.
- Importar historial de clientes (puede requerir invitación para nueva contraseña).
