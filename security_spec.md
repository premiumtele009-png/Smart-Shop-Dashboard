# Firestore Security Specification - TopUp Dynamics

## 1. Data Invariants
- A **Top-Up Record** must reference a valid **Customer** ID.
- A **Customer**'s `currentBalance` must be a non-negative number.
- `createdAt` and `updatedAt` must be server-generated timestamps.
- Only authenticated users (admins) can write to these collections (assuming an admin-managed dashboard).
- Document IDs must match standard patterns.

## 2. The "Dirty Dozen" Payloads (Target: Deny)

1. **Identity Spoofing**: Attempt to create a customer with a specific ID that does not belong to the user (if users managed their own profile, but here it's admin-only).
2. **Resource Poisoning**: Create a top-up with a 2MB long `transactionId`.
3. **State Shortcutting**: Create a top-up that is already in `success` status without passing through `pending` (if the app logic required it, but here we'll validate the status enum).
4. **Invalid Type**: Set `currentBalance` to a string `"lots"`.
5. **Missing Required Fields**: Create a customer without an `email`.
6. **Self-Assigned Admin**: Attempt to write to a hypothetical `admins` collection.
7. **Negative Balance**: Set `currentBalance` to `-100`.
8. **Future Timestamp**: Set `createdAt` to a date in 2030.
9. **Ghost Fields**: Add an `isVerified: true` field to a customer record that isn't in the schema.
10. **ID Poisoning**: Use `../../etc/passwd` as a document ID.
11. **Orphaned Top-Up**: Create a top-up for a non-existent `customerId`.
12. **Immutability Breach**: Update a customer's `createdAt` field.

## 3. Test Payloads (JSON)

### P1: Resource Poisoning (Top-Up)
```json
{
  "customerId": "cust_123",
  "amount": 50,
  "status": "success",
  "transactionId": "A".repeat(1000000), 
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### P2: Orphaned Top-Up
```json
{
  "customerId": "non_existent_customer",
  "amount": 50,
  "status": "success",
  "timestamp": "2024-01-01T00:00:00Z"
}
```
