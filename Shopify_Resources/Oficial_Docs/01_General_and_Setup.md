# Configuración General y Setup de Shopify (2025-2026)

## 1. Crear cuenta y configuración inicial
- **Cuenta**: Inicia en [Shopify](https://www.shopify.com/free-trial). Planes desde $29/mes (Basic).
- **Dashboard**: Familiarízate con el panel de administración.
- **Productos**:
    - Agrega títulos, descripciones, medios.
    - Configura variantes (talla, color) y SKU.
    - Organiza por categorías y colecciones.
- **Tema (Diseño)**:
    - Explora la [Theme Store](https://themes.shopify.com).
    - Temas recomendados: Dawn (gratis, alto rendimiento).
    - Personaliza desde "Online Store > Themes > Customize".
    - Asegura diseño "Mobile-first".

## 2. Dominios y Envíos
- **Dominio**:
    - Usa el subdominio gratuito `myshopify.com` para empezar.
    - Conecta un dominio personalizado (ej. `mitienda.com`) en "Settings > Domains".
- **Envíos**:
    - Configura zonas de envío (Doméstico, Internacional).
    - Establece tarifas (fijas, calculadas o gratuitas).
    - Considera Shopify Shipping para tarifas con descuento.

## 3. Pagos
- **Shopify Payments**: Actívalo para evitar tarifas de transacción extras. Soporta tarjetas y Apple/Google Pay.
- **Métodos Manuales**: Configura pagos contra entrega (COD) o transferencias bancarias si es necesario para tu mercado.
- **Shop Pay**: Habilítalo para un checkout acelerado (aumenta conversión).

## 4. Importación/Exportación de Productos (CSV)
Si migras o cargas masivamente:
- **Formato**: Usa el [archivo CSV de muestra de Shopify](https://help.shopify.com/manual/products/import-export/using-csv).
- **Columnas Clave**: `Handle` (ID único), `Title`, `Option1 Name/Value` (Variantes), `Image Src`.
- **Proceso**:
    1. "Products > Import".
    2. Sube el CSV.
    3. Selecciona "Overwrite products with matching handles" si estás actualizando.
    4. Revisa la vista previa y confirma.
- **Excel/Sheets**: Prepara los datos en Excel/Google Sheets y exporta como CSV UTF-8.

## Recursos Oficiales
- [Documentación de Integración de Apps](https://shopify.dev/docs/apps/build/integrating-with-shopify)
- [API Reference (Node.js)](https://github.com/Shopify/shopify-api-js)
