#!/bin/bash

# Stripe + Referral Flow Validation Script
# Project: sxgqbxgeoqsbssiwbbpi
# Usage: ./validate_stripe_flow.sh <SERVICE_ROLE_KEY>

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_REF="sxgqbxgeoqsbssiwbbpi"
BASE_URL="https://${PROJECT_REF}.supabase.co"
TEST_CODE="DEMO20"
TEST_INSTALL_ID="install_a4e4b688-56e0-4f46-9aee-0074b1d9ea53"

# Check if service key provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Service role key required${NC}"
    echo "Usage: $0 <SERVICE_ROLE_KEY>"
    exit 1
fi

SERVICE_KEY="$1"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Stripe + Referral Flow Validation${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to make REST API calls
api_get() {
    local endpoint=$1
    curl -s -X GET \
        "${BASE_URL}/rest/v1/${endpoint}" \
        -H "apikey: ${SERVICE_KEY}" \
        -H "Authorization: Bearer ${SERVICE_KEY}"
}

# Function to check if result is empty
check_result() {
    local result=$1
    local test_name=$2
    
    if [ "$result" = "[]" ] || [ -z "$result" ]; then
        echo -e "${RED}✗ FAIL${NC}: $test_name - No data found"
        return 1
    else
        echo -e "${GREEN}✓ PASS${NC}: $test_name"
        echo "$result" | jq '.' 2>/dev/null || echo "$result"
        return 0
    fi
}

# Test 1: Check Creator
echo -e "\n${YELLOW}Test 1: Creator Exists${NC}"
creator_result=$(api_get "creators?name=eq.Demo%20Creator&select=*")
check_result "$creator_result" "Creator 'Demo Creator' exists"

# Test 2: Check Referral Code
echo -e "\n${YELLOW}Test 2: Referral Code Exists${NC}"
code_result=$(api_get "referral_codes?code=eq.${TEST_CODE}&select=*,creators(name)")
check_result "$code_result" "Referral code '${TEST_CODE}' exists"

# Test 3: Check Referral Session
echo -e "\n${YELLOW}Test 3: Referral Session Captured${NC}"
session_result=$(api_get "referral_sessions?install_id=eq.${TEST_INSTALL_ID}&select=*,referral_codes(code),creators(name)")
check_result "$session_result" "Referral session '${TEST_INSTALL_ID}' exists"

# Test 4: Check Profile with Referral
echo -e "\n${YELLOW}Test 4: Profile with Referral Attribution${NC}"
profile_result=$(api_get "profiles?referred_code=eq.${TEST_CODE}&select=user_id,entitlement_status,stripe_customer_id,referred_code,referred_creator_id,referred_at")
if check_result "$profile_result" "Profile with referred_code='${TEST_CODE}' exists"; then
    # Check if entitlement_status is active
    entitlement=$(echo "$profile_result" | jq -r '.[0].entitlement_status' 2>/dev/null)
    if [ "$entitlement" = "active" ]; then
        echo -e "${GREEN}  ✓${NC} entitlement_status is 'active'"
    else
        echo -e "${RED}  ✗${NC} entitlement_status is '${entitlement}' (expected 'active')"
    fi
    
    # Check if stripe_customer_id exists
    customer_id=$(echo "$profile_result" | jq -r '.[0].stripe_customer_id' 2>/dev/null)
    if [ "$customer_id" != "null" ] && [ -n "$customer_id" ]; then
        echo -e "${GREEN}  ✓${NC} stripe_customer_id is set: ${customer_id}"
    else
        echo -e "${RED}  ✗${NC} stripe_customer_id is missing"
    fi
fi

# Test 5: Check Referrals Table
echo -e "\n${YELLOW}Test 5: Referral Link Created${NC}"
referral_result=$(api_get "referrals?select=*,referral_codes(code),creators(name)&order=attributed_at.desc&limit=5")
check_result "$referral_result" "Referral attribution records exist"

# Test 6: Check Revenue Log
echo -e "\n${YELLOW}Test 6: Referral Revenue Logged${NC}"
revenue_result=$(api_get "referral_revenue_log?select=*,creators(name)&order=created_at.desc&limit=5")
if check_result "$revenue_result" "Revenue log entries exist"; then
    # Count entries
    count=$(echo "$revenue_result" | jq 'length' 2>/dev/null)
    echo -e "${GREEN}  ✓${NC} Found ${count} revenue log entries"
    
    # Check net amount
    total=$(echo "$revenue_result" | jq '[.[].amount_net_cents] | add' 2>/dev/null)
    echo -e "${GREEN}  ✓${NC} Total net revenue: \$$(echo "scale=2; $total / 100" | bc) (${total} cents)"
fi

# Test 7: Check Creator Payouts
echo -e "\n${YELLOW}Test 7: Creator Payouts Generated${NC}"
payout_result=$(api_get "creator_payouts?select=*,creators(name,email)&order=generated_at.desc&limit=5")
if check_result "$payout_result" "Payout records exist"; then
    # Show payout summary
    count=$(echo "$payout_result" | jq 'length' 2>/dev/null)
    echo -e "${GREEN}  ✓${NC} Found ${count} payout records"
fi

# Summary
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}Validation Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Review the results above. All tests should show:"
echo "  - ${GREEN}✓ PASS${NC} for data existence checks"
echo "  - entitlement_status = 'active'"
echo "  - stripe_customer_id populated"
echo "  - At least 1 revenue log entry"
echo "  - At least 1 payout record"
echo ""
echo "If any tests failed, review the validation guide:"
echo "  ${BLUE}STRIPE_REFERRAL_VALIDATION_GUIDE.md${NC}"
echo ""

# Optional: Test webhook endpoints
read -p "Test webhook endpoints? (requires stripe CLI running) [y/N]: " test_webhooks

if [[ $test_webhooks =~ ^[Yy]$ ]]; then
    echo -e "\n${YELLOW}Testing Webhook Endpoints...${NC}"
    
    echo "Triggering checkout.session.completed..."
    stripe trigger checkout.session.completed 2>&1 | grep -E "(200|401|503)" || echo "Trigger failed"
    
    echo "Triggering customer.subscription.created..."
    stripe trigger customer.subscription.created 2>&1 | grep -E "(200|401|503)" || echo "Trigger failed"
    
    echo "Triggering invoice.payment_succeeded..."
    stripe trigger invoice.payment_succeeded 2>&1 | grep -E "(200|401|503)" || echo "Trigger failed"
    
    echo ""
    echo "Check the stripe listen terminals for HTTP status codes."
    echo "Expected: 200 OK for all events"
    echo "If 401/503: Review webhook secret configuration"
fi

echo -e "\n${GREEN}Validation script completed.${NC}"
