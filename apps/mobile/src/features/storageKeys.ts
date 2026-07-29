export const storageKeys = {
  cats: 'nyan-stock:cats',
  inventoryItems: 'nyan-stock:inventory-items',
  purchaseHistory: 'nyan-stock:purchase-history',
  settings: 'nyan-stock:settings',
  reviewPrompt: 'nyan-stock:review-prompt',
  authSession: 'nyan-stock:auth-session',
  householdSync: 'nyan-stock:household-sync',
  // Retained only so data reset can remove values written by versions that
  // collected local product-master suggestions. Current versions never write it.
  legacyUserProductSuggestions: 'nyan-stock:user-product-suggestions',
};
