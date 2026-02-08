import sys
import os
import yt_dlp

def descargar_video(url, output_folder="referencias_video"):
    # Crear carpeta si no existe
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)
        print(f"Carpeta creada: {output_folder}")
    
    opciones = {
        'format': 'best',  # Mejor calidad combinada
        'outtmpl': os.path.join(output_folder, '%(title)s.%(ext)s'), # Guardar con título original
        'noplaylist': True, # Solo video individual por defecto
    }

    print(f"--- Iniciando descarga para Arquitecto Virtual ---")
    print(f"URL: {url}")
    
    try:
        with yt_dlp.YoutubeDL(opciones) as ydl:
            ydl.download([url])
        print(f"\n[ÉXITO] Video guardado en la carpeta '{output_folder}'")
    except Exception as e:
        print(f"\n[ERROR] No se pudo descargar: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Por favor ingresa la URL del video.")
        print("Ejemplo: python descargar_videos.py https://youtube.com/...")
    else:
        url = sys.argv[1]
        descargar_video(url)
