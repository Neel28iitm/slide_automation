
import requests

url = "http://localhost:8000/api/voice/speak"
payload = {
    "text": "",
    "language": "hi"
}

try:
    response = requests.post(url, json=payload)
    print(f"Status: {response.status_code}")
    print(f"Content-Type: {response.headers.get('Content-Type')}")
    print(f"Content-Length: {len(response.content)}")
    
    with open("test_output.mp3", "wb") as f:
        f.write(response.content)
    print("Saved test_output.mp3")
except Exception as e:
    print(e)
