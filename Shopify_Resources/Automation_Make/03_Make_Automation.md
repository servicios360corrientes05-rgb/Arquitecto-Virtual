# Automatización con Make (Integromat) y Shopify

## Conexión Básica
Para conectar Make con Shopify (2024-2025):
1. **Make**: Crea un escenario nuevo.
2. **Módulo Shopify**: Agrega el módulo de Shopify.
3. **Autenticación**:
    - Haz clic en "Add connection".
    - Ingresa tu `myshopify.com` domain.
    - Sigue el flujo OAuth para autorizar la app de Make en tu tienda.

## Conexión Avanzada (API Key / Custom App)
Para mayor control o scopes específicos (`read_orders`, `write_products`):
1. **Shopify Admin**: Settings > Apps and sales channels > Develop apps.
2. **Crear App**: Nombra la app (ej. "Make Integration").
3. **Configurar Scopes**: Selecciona los permisos necesarios (ej. Admin API Scopes: `Product listings`, `Orders`).
4. **Instalar App**: Obtén el `Admin API access token` (Empieza con `shpat_...`).
5. **En Make**: Usa la opción de conexión "Shopify Custom App" o haz llamadas directas HTTP usando el token en el Header `X-Shopify-Access-Token`.

## Casos de Uso Comunes

### 1. Sincronización de Pedidos (Shopify -> Google Sheets / ERP)
- **Trigger**: Shopify "Watch Orders".
- **Action**: Google Sheets "Add a Row" o HTTP Request a tu ERP.
- **Iterator**: Si un pedido tiene múltiples productos, usa un "Iterator" en `Line Items` para procesar cada producto individualmente.

### 2. Actualización de Inventario
- **Trigger**: Webhook externo o cambio en ERP.
- **Action**: Shopify "Update a Product Variant" (Inventory Item ID).
- **Tip**: Mapea el SKU para encontrar el ID correcto primero.

### 3. Shopify Flow + Make
- Puedes usar **Shopify Flow** (app nativa) para detectar eventos y enviar un "guion" o webhook a Make para procesamiento complejo que Flow no pueda manejar.

## Integración con ScanOrders (Ejemplo Logística)
- Usar plantilla "Send Shopify Orders to ScanOrders".
- El flujo separa los ítems de línea y los envía al sistema de picking.
- Mapeo de campos: "Shipping Address" y "Bin Location" (usando metafields si es necesario).

## Recursos
- [Make Official Integrations](https://www.make.com/en/integrations/shopify)
- [Guía de Integración Make-Shopify](https://www.newoaks.ai/blog/integrate-make-com-with-shopify-create-ecommerce-chatbot/)
- [Video: Configurar Webhooks](https://www.youtube.com/watch?v=emHbzNw2WUg) (Referencia general)
