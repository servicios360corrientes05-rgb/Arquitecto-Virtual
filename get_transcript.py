from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.formatters import TextFormatter

video_id = 'GFrrmkdneMk'

try:
    # New API syntax for version 1.2.x - request Spanish transcript
    ytt_api = YouTubeTranscriptApi()
    transcript = ytt_api.fetch(video_id, languages=['es'])
    
    print("=" * 60)
    print("TRANSCRIPCIÓN DEL VIDEO: Subir Productos masivos a Shopify")
    print("=" * 60)
    print()
    
    full_text = []
    for item in transcript:
        start = item.start
        timestamp = f"{int(start // 60):02d}:{int(start % 60):02d}"
        text = item.text
        print(f"[{timestamp}] {text}")
        full_text.append(text)
    
    print()
    print("=" * 60)
    print("TEXTO COMPLETO:")
    print("=" * 60)
    print(" ".join(full_text))
    
    # Save to file
    with open('transcripcion_video_shopify.txt', 'w', encoding='utf-8') as f:
        f.write("TRANSCRIPCIÓN: Subir Productos masivos a Shopify\n")
        f.write("Video: https://www.youtube.com/watch?v=GFrrmkdneMk\n")
        f.write("=" * 60 + "\n\n")
        for item in transcript:
            start = item.start
            timestamp = f"{int(start // 60):02d}:{int(start % 60):02d}"
            f.write(f"[{timestamp}] {item.text}\n")
        f.write("\n" + "=" * 60 + "\n")
        f.write("TEXTO COMPLETO:\n")
        f.write(" ".join(full_text))
    
    print()
    print("✅ Transcripción guardada en: transcripcion_video_shopify.txt")
    
except Exception as e:
    print(f"Error al obtener transcripción: {e}")
    print("Intentando listar transcripciones disponibles...")
    try:
        ytt_api = YouTubeTranscriptApi()
        transcript_list = ytt_api.list(video_id)
        print("Transcripciones disponibles:")
        for t in transcript_list:
            print(f"  - {t.language} ({t.language_code})")
    except Exception as e2:
        print(f"No hay transcripciones disponibles: {e2}")
