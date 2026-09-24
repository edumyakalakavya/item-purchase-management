const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchaseController');

// Purchase routes (NOTE: No DELETE route as purchases represent immutable historical audit records)
router.get('/', purchaseController.getAllPurchases);
router.get('/:id', purchaseController.getPurchaseById);
router.post('/', purchaseController.createPurchase);
router.put('/:id', purchaseController.updatePurchase);

module.exports = router;
