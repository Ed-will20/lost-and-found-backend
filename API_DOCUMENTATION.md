# Lost & Found API Documentation

Complete REST API for the Lost and Found application.

## 🚀 Base URL
```
http://localhost:5000
```

## 📋 Authentication

All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## 🔐 Authentication Endpoints

### Register User
**POST** `/api/auth/register`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "full_name": "John Doe",
  "phone_number": "1234567890",
  "city": "Los Angeles",
  "state": "California",
  "zip_code": "90001"
}
```

**Response:**
```json
{
  "message": "User registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "John Doe",
    "city": "Los Angeles",
    "state": "California",
    "zip_code": "90001"
  }
}
```

### Login
**POST** `/api/auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}
```

### Get Profile
**GET** `/api/auth/profile` 🔒

**Headers:**
```
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "John Doe",
    "phone_number": "1234567890",
    "city": "Los Angeles",
    "state": "California",
    "zip_code": "90001",
    "verification_status": "unverified",
    "rating": 0.00,
    "created_at": "2025-01-05T..."
  }
}
```

---

## 📦 Item Endpoints

### Get All Items
**GET** `/api/items`

**Query Parameters:**
- `category` - Filter by category (wallet, phone, keys, etc.)
- `state` - Filter by US state
- `city` - Filter by city (partial match)
- `status` - Filter by status (found, claimed, resolved)
- `search` - Search in title and description
- `limit` - Max items to return (default: 50)
- `offset` - Pagination offset (default: 0)

**Example:**
```
GET /api/items?state=California&category=wallet&limit=10
```

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "title": "Lost Wallet",
      "description": "Brown leather wallet",
      "category": "wallet",
      "status": "found",
      "images": ["/uploads/image1.jpg"],
      "found_address": "123 Main St",
      "found_city": "Los Angeles",
      "found_state": "California",
      "found_zip": "90001",
      "found_lat": 34.0522,
      "found_lng": -118.2437,
      "found_date": "2025-01-05",
      "tags": ["wallet", "brown"],
      "finder_name": "John Doe",
      "finder_rating": 4.5,
      "created_at": "2025-01-05T..."
    }
  ],
  "count": 1
}
```

### Get Item by ID
**GET** `/api/items/:id`

**Response:**
```json
{
  "item": {
    "id": "uuid",
    "title": "Lost Wallet",
    "finder_name": "John Doe",
    "finder_email": "john@example.com",
    "finder_phone": "1234567890",
    ...
  }
}
```

### Search Nearby Items
**GET** `/api/items/nearby`

**Query Parameters:**
- `lat` - Latitude (required)
- `lng` - Longitude (required)
- `radius` - Search radius in miles (default: 50)

**Example:**
```
GET /api/items/nearby?lat=34.0522&lng=-118.2437&radius=25
```

**Response:**
```json
{
  "items": [...],
  "count": 5
}
```

### Create Item
**POST** `/api/items` 🔒

**Headers:**
```
Authorization: Bearer YOUR_TOKEN
Content-Type: multipart/form-data
```

**Form Data:**
```
title: "Lost iPhone"
description: "Black iPhone 13"
category: "electronics"
found_address: "Downtown"
found_city: "Los Angeles"
found_state: "California"
found_zip: "90001"
found_lat: 34.0522
found_lng: -118.2437
found_date: "2025-01-05"
is_sensitive: false
tags: ["iphone", "black"]
images: [file1.jpg, file2.jpg] (up to 5 images)
```

**Response:**
```json
{
  "message": "Item posted successfully",
  "item": { ... }
}
```

### Update Item
**PUT** `/api/items/:id` 🔒

**Request Body:**
```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "status": "claimed"
}
```

### Delete Item
**DELETE** `/api/items/:id` 🔒

### Get My Items
**GET** `/api/items/my-items` 🔒

---

## 🎯 Claim Endpoints

### Submit Claim
**POST** `/api/items/:item_id/claim` 🔒

**Headers:**
```
Content-Type: multipart/form-data
```

**Form Data:**
```
proof_description: "This is my wallet, here's proof"
proof_images: [proof1.jpg, proof2.jpg] (up to 3 images)
```

### Get Claims for Item
**GET** `/api/items/:item_id/claims` 🔒

(Only the item owner can view)

### Get My Claims
**GET** `/api/my-claims` 🔒

### Approve Claim
**PUT** `/api/claims/:claim_id/approve` 🔒

### Reject Claim
**PUT** `/api/claims/:claim_id/reject` 🔒

---

## 📊 Response Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (not authorized to access resource)
- `404` - Not Found
- `500` - Server Error

---

## 🔒 Security Notes

- All passwords are hashed with bcrypt
- JWT tokens expire in 7 days
- File uploads limited to 5MB per file
- Only image files allowed (jpg, png, gif, webp)
- SQL injection protection via parameterized queries

---

## 🧪 Testing

Run the automated test suite:
```bash
./test-api.sh
```

---

## 📝 Example Workflow

1. **Register a user**
2. **Login to get token**
3. **Create a found item**
4. **Another user registers**
5. **Second user submits claim with proof**
6. **First user reviews claims**
7. **First user approves/rejects claim**
8. **Item marked as claimed**

---

Built with ❤️ using Node.js, Express, and PostgreSQL
