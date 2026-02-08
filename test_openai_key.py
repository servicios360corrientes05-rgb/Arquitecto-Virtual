import os
from openai import OpenAI

# La clave proporcionada por el usuario
api_key = "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"

client = OpenAI(api_key=api_key)

print(f"Probando clave API: {api_key[:10]}...{api_key[-5:]}")

try:
    # Intentar una llamada simple para verificar validez y cuota
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": "Hola, ¿funcionas?"}],
        max_tokens=5
    )
    print("\n[ÉXITO] La clave API es VÁLIDA y tiene saldo operativo.")
    print(f"Respuesta de OpenAI: {response.choices[0].message.content}")

except Exception as e:
    print("\n[ERROR] La clave API falló.")
    print(f"Detalle del error: {e}")
