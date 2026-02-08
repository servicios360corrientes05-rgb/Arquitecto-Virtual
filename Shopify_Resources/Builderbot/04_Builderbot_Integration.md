# Integración con Builderbot.cloud (WhatsApp IA)

Builderbot es una plataforma Low-Code para crear Chatbots de WhatsApp. La integración con Shopify suele ser "indirecta" vía API o Make, ya que no es una app nativa del App Store de Shopify.

## Arquitectura de la Solución
**Shopify**  <-->  **Make (Middleware)**  <-->  **Builderbot (WhatsApp)**

## Paso 1: Configurar Builderbot
1. **Proveedor**: Configura tu proveedor de WhatsApp (Meta Cloud API, Twilio, o Baileys para conexión QR gratuita/testing).
2. **Flujo**: Diseña tu flujo de conversación en Builderbot (Bienvenida, Menú, Consulta de Pedido).
3. **API/Webhook**: Builderbot expone endpoints para recibir mensajes (POST) y enviar mensajes.

## Paso 2: Flujo: Recuperación de Carrito / Confirmación de Pedido
El objetivo es que cuando ocurra un evento en Shopify, se envíe un WhatsApp.

1. **Trigger en Make**: Shopify "Watch Orders" o "Watch Abandoned Checkouts".
2. **Lógica**: Filtra si el cliente tiene teléfono válido.
3. **Acción HTTP (Make)**:
    - Realiza una petición POST al endpoint de tu Bot en Builderbot.
    - **Payload**:
      ```json
      {
        "phone": "+54911...",
        "message": "Hola {Nombre}, gracias por tu compra #{OrderNumber}. Tu pedido contiene: {Productos}."
      }
      ```
4. **Respuesta Builderbot**: El bot recibe el POST y dispara el mensaje al usuario vía WhatsApp.

## Paso 3: Flujo: Chatbot IA para Ventas (Consultar Stock)
El usuario pregunta por stock en WhatsApp.

1. **Usuario**: "¿Tienen zapatillas rojas?"
2. **Builderbot**: Detecta intención -> Llama a un flujo auxiliar.
3. **Builderbot -> Make -> Shopify**:
    - Builderbot hace una petición a un Webhook de Make.
    - Make busca en Shopify "List Products" con query "zapatillas rojas".
    - Make devuelve la respuesta (JSON) con precio y stock.
4. **Builderbot**: Procesa el JSON y responde: "Sí, tenemos Zapatillas Rojas a $50. ¿Quieres comprar?".

## Herramientas Clave
- **Latenode / Make**: Para orquestar la comunicación.
- **Meta Cloud API**: Recomendado para estabilidad oficial en 2025.
- **[Builderbot Providers](https://www.builderbot.app/providers)**: Documentación de conexión.

## Recursos Video/Tutoriales
- [Integrar Make con Shopify y Chatbot](https://www.newoaks.ai/blog/integrate-make-com-with-shopify-create-ecommerce-chatbot/)
- [Builderbot Web](https://app.builderbot.cloud)
