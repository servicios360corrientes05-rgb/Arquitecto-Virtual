import os

video_path = r"d:\DANIEL\Downloads\Antigravity\Proyectos\Arquitecto Virtual\referencias_video\Subir Productos masivos a Shopify.mp4"

# Verificar si existe
if not os.path.exists(video_path):
    print("ERROR: El archivo no existe")
else:
    # Obtener tamaño
    size = os.path.getsize(video_path)
    print(f"Archivo encontrado: {os.path.basename(video_path)}")
    print(f"Tamanio: {size:,} bytes ({size/1024/1024:.2f} MB)")
    
    # Leer header para verificar formato MP4
    with open(video_path, 'rb') as f:
        header = f.read(32)
    
    print(f"Header (primeros 32 bytes): {header[:12].hex()}")
    
    # Verificar firma MP4 (ftyp box)
    if b'ftyp' in header:
        print("RESULTADO: El archivo tiene formato MP4 valido")
    else:
        print("ADVERTENCIA: No se detecta firma MP4 standard")
    
    # Verificar si el archivo parece completo (tiene datos sustanciales)
    if size > 1000000:  # Más de 1 MB
        print("El archivo tiene un tamanio razonable para un video")
    else:
        print("ADVERTENCIA: El archivo parece muy pequeño")
