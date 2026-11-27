UPDATE payment_attempts AS attempt
SET product_id = device_product.id
FROM products AS device_product
WHERE attempt.device_id = device_product.device_id
  AND attempt.device_id <> 'APD260209001'
  AND right(device_product.id, 32) ~ '^[0-9a-f]{32}$'
  AND left(device_product.id, length(device_product.id) - 33) = attempt.product_id;
