# Report Image Generator API (Node.js)

JSON array request လက်ခံပြီး dashboard image (`.svg`) generate လုပ်ကာ URL နဲ့ပြန်ပေးတဲ့ API ဖြစ်ပါတယ်။

## Run

```bash
npm start
```

Server က default `0.0.0.0:3000` ပေါ် bind လုပ်ထားလို့ LAN (`192.168.x.x`) ထဲက device တွေက access ရပါတယ်။

## Endpoints

- `GET /health`
- `POST /api/report-image`
- `GET /images/:filename` (generated image files)

## Request Payload
`POST /api/report-image` body က array ဖြစ်ရပါမယ်:

```json
[
  {
    "product_category_name": "01-Cement and Block",
    "branch_name": "MM-101-/-Lanthit",
    "ytd_previous_saleamnt": "732886986.7600",
    "ytd_previous_billno": "1016"
  }
]
```

## Test

```bash
curl -X POST http://localhost:3000/api/report-image \
  -H "Content-Type: application/json" \
  --data @sample-array-request.json
```

Response ဥပမာ:

```json
{
  "ok": true,
  "message": "Report image generated",
  "image_url": "http://192.168.1.10:3000/images/report-xxx.svg"
}
```

`image_url` ကို browser/app မှာဖွင့်လို့ image ကြည့်နိုင်ပါတယ်။
