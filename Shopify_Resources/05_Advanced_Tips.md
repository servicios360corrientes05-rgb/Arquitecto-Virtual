# Trucos y Mejores Prácticas Avanzadas (2025)

## Optimización de Conversión (CRO)
- **Pago en una página**: Usa el checkout de una sola página (One-page checkout) que es estándar ahora en Shopify para reducir fricción.
- **Shop Pay**: Habilítalo. Aumenta la tasa de conversión significativamente.
- **Velocidad**:
    - Comprime imágenes (WebP).
    - Elimina apps que no uses (el JS de las apps viejas ralentiza el sitio).
    - Usa fuentes del sistema o self-hosted para evitar CLS (Cumulative Layout Shift).

## SEO Técnico
- **Estructura de URL**: Mantén `/products/nombre-producto` limpio. Evita colecciones anidadas en la URL canónica si es posible para evitar duplicados.
- **Datos Estructurados (Schema)**: Asegura que tu tema incluya JSON-LD para Productos, Reviews y Disponibilidad. Esto muestra estrellas y precios en Google.
- **Blog**: Crea contenido transaccional ("Mejores zapatillas para correr 2025") para capturar tráfico top-of-funnel.

## Desarrollo de Temas (Liquid)
- **Clean Code**: Usa snippets reutilizables para componentes repetidos (botones, cards de producto).
- **App Block**: Si construyes o integras apps, usa "App Blocks" en lugar de inyectar código hardcodeado en `theme.liquid`. Es el estándar "Build for Shopify" 2025.
- **Metafields**: Usa Metafiles para guardar datos extra (guías de tallas, fechas de entrega estimadas) sin usar apps pesadas.

## Automatización de Marketing
- **Klaviyo**: Estándar de oro para Email/SMS en Shopify.
    - Flujo "Welcome Series".
    - Flujo "Abandoned Cart" (diferente al checkout abandonado).
    - Segmentación por VIPs (compradores recurrentes).

## Errores Comunes a Evitar
1. **No configurar el Pixel**: Instala Facebook CAPI y Google Analytics 4 desde el día 1.
2. **Ignorar Mobile**: El 70%+ del tráfico es móvil. Diseña y prueba en celular primero.
3. **Apps Excesivas**: No instales 20 apps. Cada una agrega tiempo de carga. Intenta resolver con Liquid o Make lo que puedas.
