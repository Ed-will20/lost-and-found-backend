#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Lost & Found API Test Suite        ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""

BASE_URL="http://localhost:5000"

# Test 1: Health Check
echo -e "${BLUE}[1/7] Testing Health Endpoint...${NC}"
HEALTH=$(curl -s $BASE_URL/health)
if echo $HEALTH | grep -q "ok"; then
    echo -e "${GREEN}✅ Health check passed${NC}"
else
    echo -e "${RED}❌ Health check failed${NC}"
    exit 1
fi
echo ""

# Test 2: Register User
echo -e "${BLUE}[2/7] Testing User Registration...${NC}"
TIMESTAMP=$(date +%s)
REGISTER=$(curl -s -X POST $BASE_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"testuser${TIMESTAMP}@example.com\",
    \"password\": \"password123\",
    \"full_name\": \"Test User\",
    \"city\": \"Los Angeles\",
    \"state\": \"California\",
    \"zip_code\": \"90001\"
  }")

if echo $REGISTER | grep -q "token"; then
    echo -e "${GREEN}✅ User registration successful${NC}"
    TOKEN=$(echo $REGISTER | grep -o '"token":"[^"]*' | cut -d'"' -f4)
    USER_ID=$(echo $REGISTER | grep -o '"id":"[^"]*' | cut -d'"' -f4)
    echo "   Token: ${TOKEN:0:30}..."
    echo "   User ID: $USER_ID"
else
    echo -e "${RED}❌ User registration failed${NC}"
    echo "$REGISTER"
    exit 1
fi
echo ""

# Test 3: Login
echo -e "${BLUE}[3/7] Testing User Login...${NC}"
LOGIN=$(curl -s -X POST $BASE_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"testuser${TIMESTAMP}@example.com\",
    \"password\": \"password123\"
  }")

if echo $LOGIN | grep -q "token"; then
    echo -e "${GREEN}✅ User login successful${NC}"
else
    echo -e "${RED}❌ User login failed${NC}"
    exit 1
fi
echo ""

# Test 4: Get Profile
echo -e "${BLUE}[4/7] Testing Get Profile...${NC}"
PROFILE=$(curl -s $BASE_URL/api/auth/profile \
  -H "Authorization: Bearer $TOKEN")

if echo $PROFILE | grep -q "Test User"; then
    echo -e "${GREEN}✅ Profile retrieval successful${NC}"
else
    echo -e "${RED}❌ Profile retrieval failed${NC}"
    exit 1
fi
echo ""

# Test 5: Create Item
echo -e "${BLUE}[5/7] Testing Create Item...${NC}"
CREATE_ITEM=$(curl -s -X POST $BASE_URL/api/items \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Lost Wallet",
    "description": "Brown leather wallet found in park",
    "category": "wallet",
    "found_address": "Central Park",
    "found_city": "Los Angeles",
    "found_state": "California",
    "found_zip": "90001",
    "found_lat": 34.0522,
    "found_lng": -118.2437,
    "found_date": "2025-01-05",
    "tags": ["wallet", "brown", "leather"]
  }')

if echo $CREATE_ITEM | grep -q "Item posted successfully"; then
    echo -e "${GREEN}✅ Item creation successful${NC}"
    ITEM_ID=$(echo $CREATE_ITEM | grep -o '"id":"[^"]*' | cut -d'"' -f4)
    echo "   Item ID: $ITEM_ID"
else
    echo -e "${RED}❌ Item creation failed${NC}"
    echo "$CREATE_ITEM"
    exit 1
fi
echo ""

# Test 6: Get All Items
echo -e "${BLUE}[6/7] Testing Get All Items...${NC}"
ALL_ITEMS=$(curl -s $BASE_URL/api/items)

if echo $ALL_ITEMS | grep -q "items"; then
    ITEM_COUNT=$(echo $ALL_ITEMS | grep -o '"count":[0-9]*' | cut -d':' -f2)
    echo -e "${GREEN}✅ Get items successful${NC}"
    echo "   Total items: $ITEM_COUNT"
else
    echo -e "${RED}❌ Get items failed${NC}"
    exit 1
fi
echo ""

# Test 7: Search Nearby
echo -e "${BLUE}[7/7] Testing Nearby Search...${NC}"
NEARBY=$(curl -s "$BASE_URL/api/items/nearby?lat=34.0522&lng=-118.2437&radius=50")

if echo $NEARBY | grep -q "items"; then
    NEARBY_COUNT=$(echo $NEARBY | grep -o '"count":[0-9]*' | cut -d':' -f2)
    echo -e "${GREEN}✅ Nearby search successful${NC}"
    echo "   Nearby items: $NEARBY_COUNT"
else
    echo -e "${RED}❌ Nearby search failed${NC}"
    exit 1
fi
echo ""

# Summary
echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           All Tests Passed!           ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✅ Health Check${NC}"
echo -e "${GREEN}✅ User Registration${NC}"
echo -e "${GREEN}✅ User Login${NC}"
echo -e "${GREEN}✅ Get Profile${NC}"
echo -e "${GREEN}✅ Create Item${NC}"
echo -e "${GREEN}✅ Get All Items${NC}"
echo -e "${GREEN}✅ Search Nearby${NC}"
echo ""
echo -e "${BLUE}Your API is working perfectly! 🎉${NC}"
