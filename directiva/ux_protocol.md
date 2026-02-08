# 🤖 PROTOCOLO DE INTERACCIÓN Y CLARIFICACIÓN UX
**Versión**: 1.0
**Enfoque**: Corrientes Municipal
**Objetivo**: Reducir errores de procesamiento y mejorar la confianza del profesional.

---

## 1. Reglas de Validación de Entrada (Pre-Scraping)

Antes de ejecutar cualquier script, el orquestador debe verificar:

*   **Formato de Adrema**: Debe cumplir con el patrón de una letra seguida de números (ej. `A10169791`).
*   **Integridad del Distrito**: Si el usuario menciona un distrito, comparar contra la base de datos `normativa_completa.json`.
*   **Umbral de Confianza**: Si la consulta tiene menos de 5 palabras o carece de datos numéricos clave, activar Fase de Clarificación.

## 2. Scripts de Respuesta ante Ambigüedad

Utilizar estas estructuras de respuesta para mantener el tono profesional y futurista:

### Caso A: Adrema mal escrito o incompleto
> "He recibido tu solicitud para el análisis de parcela, pero el número de Adrema ingresado parece tener un error de formato. Para garantizar la precisión del informe municipal en Corrientes, ¿podrías confirmarme el código exacto de tu boleta?"

### Caso B: Distrito inexistente o con error tipográfico (Fuzzy Matching)
> "No logro localizar el Distrito [Dato_Usuario] en la normativa vigente. Sin embargo, por la zona detectada, podría tratarse del Distrito [Sugerencia_Base_Datos]. ¿Es correcto para proceder con el cálculo de FOT/FOS?".

### Caso C: Error de carga en la Web Municipal (Timeout)
> "El servidor de la Municipalidad de Corrientes está tardando más de lo habitual. No te preocupes, mi sistema de auto-corrección está reintentando el acceso de forma segura. Te avisaré en unos segundos."

## 3. Lógica de "Pensamiento" de la Orquestación

1.  **INPUT**: Usuario escribe consulta.
2.  **ANALYSIS**: ¿Es determinista? (¿Tengo Adrema y Distrito claros?).
3.  **DECISION**:
    *   **SI**: Ejecutar Scraper (Capa 3).
    *   **NO**: Ejecutar Script de Clarificación (Capa 2).
4.  **LEARNING**: Si el usuario corrige el dato, guardar la asociación en el log de errores para mejorar futuras predicciones.
