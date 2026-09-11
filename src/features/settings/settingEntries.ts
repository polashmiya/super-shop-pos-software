import type { SettingsSearchEntry } from './searchIndex';

/* ==========================================================================
   Individual settings for the settings search and the command palette.
   `anchor` equals the control's data-setting (the page scrolls to it and
   highlights it); keywords add synonyms in both languages so "ছবি",
   "photo" and "image" all find the product image switch.
   ========================================================================== */

export const SETTING_ENTRIES: SettingsSearchEntry[] = [
  /* General */
  { section: 'general', anchor: 'landingPage', labelKey: 'settings.general.landingPage', keywords: 'start home first screen startup শুরু প্রথম পাতা' },
  { section: 'general', anchor: 'confirmExit', labelKey: 'settings.general.confirmExit', keywords: 'close quit exit বন্ধ' },
  { section: 'general', anchor: 'sidebar', labelKey: 'settings.general.sidebar', keywords: 'menu navigation compact সাইডবার মেনু' },
  { section: 'general', anchor: 'focusMode', labelKey: 'settings.general.focusMode', keywords: 'cashier focus distraction ফোকাস ক্যাশিয়ার' },
  { section: 'general', anchor: 'resetTerminal', labelKey: 'settings.general.resetTerminalAction', keywords: 'reset default terminal রিসেট ডিফল্ট' },

  /* Store */
  { section: 'store', anchor: 'storeName', labelKey: 'settings.store.nameBn', keywords: 'shop name store দোকানের নাম' },
  { section: 'store', anchor: 'storeName', labelKey: 'settings.store.nameEn', keywords: 'shop name english store' },
  { section: 'store', anchor: 'storeAddress', labelKey: 'settings.store.addressBn', keywords: 'address location ঠিকানা' },
  { section: 'store', anchor: 'storeContact', labelKey: 'settings.store.phone', keywords: 'phone mobile contact email website ফোন মোবাইল ইমেইল' },
  { section: 'store', anchor: 'storeBin', labelKey: 'settings.store.bin', keywords: 'bin vat registration tax id trade licence বিআইএন ভ্যাট নিবন্ধন ট্রেড লাইসেন্স' },
  { section: 'store', anchor: 'logo', labelKey: 'settings.store.logo', keywords: 'logo image picture brand লোগো ছবি' },

  /* Counter */
  { section: 'counter', anchor: 'terminalCounter', labelKey: 'settings.counter.counter', keywords: 'counter till terminal কাউন্টার' },
  { section: 'counter', anchor: 'terminalName', labelKey: 'settings.counter.name', keywords: 'terminal computer name টার্মিনাল নাম' },

  /* POS */
  { section: 'pos', anchor: 'posLayout', labelKey: 'settings.pos.layout', keywords: 'layout counter scan only no product cards hide grid shwapno agora লেআউট কাউন্টার স্ক্যান কার্ড লুকান' },
  { section: 'pos', anchor: 'posAutoFocus', labelKey: 'settings.pos.autoFocus', keywords: 'barcode scanner focus search বারকোড স্ক্যানার' },
  { section: 'pos', anchor: 'posAutoAdd', labelKey: 'settings.pos.autoAdd', keywords: 'scan add cart স্ক্যান কার্ট' },
  { section: 'pos', anchor: 'posDuplicateQty', labelKey: 'settings.pos.duplicateQty', keywords: 'duplicate scan quantity increase পরিমাণ বাড়ানো' },
  { section: 'pos', anchor: 'posQuickCheckout', labelKey: 'settings.pos.quickCheckout', keywords: 'payment open auto checkout পেমেন্ট' },
  { section: 'pos', anchor: 'posImages', labelKey: 'settings.pos.showImages', keywords: 'product image picture photo ছবি পণ্যের ছবি' },
  { section: 'pos', anchor: 'posCardSize', labelKey: 'settings.pos.cardSize', keywords: 'card size grid tile কার্ডের আকার' },
  { section: 'pos', anchor: 'posConfirmClear', labelKey: 'settings.pos.confirmClear', keywords: 'clear cart confirm কার্ট খালি নিশ্চিত' },
  { section: 'pos', anchor: 'posClearAfterSale', labelKey: 'settings.pos.clearAfterSale', keywords: 'new sale clear cart নতুন বিক্রয়' },
  { section: 'pos', anchor: 'posCustomerPanel', labelKey: 'settings.pos.customerPanel', keywords: 'customer display panel গ্রাহক প্যানেল' },
  { section: 'pos', anchor: 'posKeypad', labelKey: 'settings.pos.keypad', keywords: 'numeric keypad touch number কিপ্যাড টাচ' },
  { section: 'pos', anchor: 'posRememberCategory', labelKey: 'settings.pos.rememberCategory', keywords: 'last category remember ক্যাটাগরি মনে রাখা' },
  { section: 'pos', anchor: 'posRememberPayment', labelKey: 'settings.pos.rememberPayment', keywords: 'last payment method remember পেমেন্ট পদ্ধতি' },
  { section: 'pos', anchor: 'posHoldLimit', labelKey: 'settings.pos.holdLimit', keywords: 'hold recall held sales হোল্ড' },
  { section: 'pos', anchor: 'posPriceOverride', labelKey: 'settings.pos.priceOverride', keywords: 'price change override দাম পরিবর্তন' },
  { section: 'pos', anchor: 'posQuickCash', labelKey: 'settings.pos.quickCash', keywords: 'quick cash buttons notes নগদ বাটন' },
  { section: 'pos', anchor: 'posScanBeep', labelKey: 'settings.pos.scanBeep', keywords: 'beep sound scan শব্দ বিপ' },

  /* Sales */
  { section: 'sales', anchor: 'invoicePrefix', labelKey: 'settings.sales.prefix', keywords: 'invoice number prefix INV চালান নম্বর' },
  { section: 'sales', anchor: 'salesRounding', labelKey: 'settings.currency.rounding', keywords: 'rounding poisha round total রাউন্ডিং পয়সা' },
  { section: 'sales', anchor: 'returnWindow', labelKey: 'settings.sales.returnWindow', keywords: 'return refund days ফেরত দিন' },
  { section: 'sales', anchor: 'cashierReturnWindow', labelKey: 'settings.sales.cashierWindow', keywords: 'cashier return limit ক্যাশিয়ার ফেরত' },
  { section: 'sales', anchor: 'allowCancel', labelKey: 'settings.sales.allowCancel', keywords: 'cancel void sale বাতিল' },
  { section: 'sales', anchor: 'cancelWindow', labelKey: 'settings.sales.cancelWindow', keywords: 'cancel hours time বাতিল সময়' },

  /* Payment */
  { section: 'payment', anchor: 'method-cash', labelKey: 'enums.paymentMethod.cash', keywords: 'cash payment নগদ ক্যাশ' },
  { section: 'payment', anchor: 'method-card', labelKey: 'enums.paymentMethod.card', keywords: 'card visa mastercard কার্ড' },
  { section: 'payment', anchor: 'method-mobile', labelKey: 'enums.paymentMethod.mobile', keywords: 'mobile banking MFS মোবাইল ব্যাংকিং' },
  { section: 'payment', anchor: 'provider-bkash', labelKey: 'enums.mobileProvider.bkash', keywords: 'bkash বিকাশ mobile' },
  { section: 'payment', anchor: 'provider-nagad', labelKey: 'enums.mobileProvider.nagad', keywords: 'nagad নগদ mobile' },
  { section: 'payment', anchor: 'provider-rocket', labelKey: 'enums.mobileProvider.rocket', keywords: 'rocket রকেট dbbl mobile' },
  { section: 'payment', anchor: 'cardReference', labelKey: 'settings.payment.cardRef', keywords: 'card reference approval code রেফারেন্স' },
  { section: 'payment', anchor: 'mobileReference', labelKey: 'settings.payment.mobileRef', keywords: 'transaction id trx reference ট্রানজেকশন' },
  { section: 'payment', anchor: 'splitPayment', labelKey: 'settings.payment.split', keywords: 'split payment multiple methods ভাগ করে পেমেন্ট' },
  { section: 'payment', anchor: 'quickCash', labelKey: 'settings.quickCash.title', keywords: 'quick cash amounts 500 1000 নগদ দ্রুত' },

  /* Tax */
  { section: 'tax', anchor: 'taxEnabled', labelKey: 'settings.tax.enabled', keywords: 'vat tax ভ্যাট কর' },
  { section: 'tax', anchor: 'taxMode', labelKey: 'settings.tax.mode', keywords: 'inclusive exclusive vat price ভ্যাটসহ ভ্যাট ছাড়া' },
  { section: 'tax', anchor: 'taxDefaultRate', labelKey: 'settings.tax.defaultRate', keywords: 'vat rate 5% percent হার' },
  { section: 'tax', anchor: 'taxLabel', labelKey: 'settings.tax.labels', keywords: 'vat label name ভ্যাট লেবেল' },
  { section: 'tax', anchor: 'taxBreakdown', labelKey: 'settings.tax.showBreakdown', keywords: 'vat breakdown receipt বিভাজন' },
  { section: 'tax', anchor: 'taxShowBin', labelKey: 'settings.tax.showBin', keywords: 'bin receipt vat registration বিআইএন' },

  /* Discount */
  { section: 'discount', anchor: 'itemDiscount', labelKey: 'settings.discount.item', keywords: 'item line discount পণ্য ছাড়' },
  { section: 'discount', anchor: 'orderDiscount', labelKey: 'settings.discount.order', keywords: 'cart order discount কার্ট ছাড়' },
  { section: 'discount', anchor: 'discountReason', labelKey: 'settings.discount.reason', keywords: 'discount reason কারণ' },
  { section: 'discount', anchor: 'cashierDiscountLimit', labelKey: 'settings.discount.cashierMax', keywords: 'cashier limit maximum discount সীমা' },
  { section: 'discount', anchor: 'managerDiscountLimit', labelKey: 'settings.discount.managerMax', keywords: 'manager limit approval ম্যানেজার অনুমোদন' },
  { section: 'discount', anchor: 'largeDiscount', labelKey: 'settings.discount.alert', keywords: 'large discount alert বড় ছাড় সতর্কতা' },

  /* Customers & loyalty */
  { section: 'customer', anchor: 'requirePhone', labelKey: 'settings.customer.requirePhone', keywords: 'customer phone mobile required গ্রাহক মোবাইল' },
  { section: 'customer', anchor: 'defaultCustomerType', labelKey: 'settings.customer.defaultType', keywords: 'customer type regular vip wholesale ধরন' },
  { section: 'customer', anchor: 'memberDiscountAuto', labelKey: 'settings.customer.autoApply', keywords: 'member discount vip wholesale সদস্য ছাড়' },
  { section: 'loyalty', anchor: 'loyaltyEnabled', labelKey: 'settings.loyalty.enabled', keywords: 'loyalty points reward লয়্যালটি পয়েন্ট' },
  { section: 'loyalty', anchor: 'loyaltyEarnStep', labelKey: 'settings.loyalty.earnStep', keywords: 'earn points per 100 taka পয়েন্ট অর্জন' },
  { section: 'loyalty', anchor: 'loyaltyPointValue', labelKey: 'settings.loyalty.pointValue', keywords: 'point value redeem taka পয়েন্টের মূল্য' },
  { section: 'loyalty', anchor: 'loyaltyMinRedeem', labelKey: 'settings.loyalty.minRedeem', keywords: 'redeem minimum রিডিম' },
  { section: 'loyalty', anchor: 'loyaltyMaxRedeem', labelKey: 'settings.loyalty.maxRedeem', keywords: 'redeem maximum percent রিডিম সর্বোচ্চ' },

  /* Receipt */
  { section: 'receipt', anchor: 'receiptHeader', labelKey: 'settings.receipt.headerBn', keywords: 'receipt header top text রসিদ শিরোনাম' },
  { section: 'receipt', anchor: 'receiptThanks', labelKey: 'settings.receipt.thankYouBn', keywords: 'thank you message ধন্যবাদ বার্তা' },
  { section: 'receipt', anchor: 'receiptFooter', labelKey: 'settings.receipt.footerBn', keywords: 'receipt footer bottom text রসিদ ফুটার' },
  { section: 'receipt', anchor: 'receipt-showLogo', labelKey: 'settings.receipt.showLogo', keywords: 'receipt logo image picture লোগো ছবি' },
  { section: 'receipt', anchor: 'receipt-showCustomerName', labelKey: 'settings.receipt.showCustomerName', keywords: 'customer name receipt গ্রাহকের নাম' },
  { section: 'receipt', anchor: 'receipt-showCustomerPhone', labelKey: 'settings.receipt.showCustomerPhone', keywords: 'customer phone receipt গ্রাহকের ফোন' },
  { section: 'receipt', anchor: 'receipt-showLoyaltyPoints', labelKey: 'settings.receipt.showLoyaltyPoints', keywords: 'loyalty points receipt পয়েন্ট' },
  { section: 'receipt', anchor: 'receipt-showMembership', labelKey: 'settings.receipt.showMembership', keywords: 'membership vip receipt সদস্যপদ' },
  { section: 'receipt', anchor: 'receipt-showBarcode', labelKey: 'settings.receipt.showBarcode', keywords: 'invoice barcode receipt বারকোড' },
  { section: 'receipt', anchor: 'receipt-showSavings', labelKey: 'settings.receipt.showSavings', keywords: 'savings discount you saved সাশ্রয়' },
  { section: 'receipt', anchor: 'receiptPaper', labelKey: 'settings.receipt.paperWidth', keywords: 'paper 80mm 58mm thermal width কাগজ' },
  { section: 'receipt', anchor: 'receiptCopies', labelKey: 'settings.receipt.copies', keywords: 'copies print receipt কপি' },
  { section: 'receipt', anchor: 'receiptLanguage', labelKey: 'settings.receipt.language', keywords: 'receipt language bangla english রসিদের ভাষা' },

  /* Products & inventory */
  { section: 'products', anchor: 'productImages', labelKey: 'settings.products.showImages', keywords: 'product image picture photo show hide ছবি দেখান লুকান' },
  { section: 'products', anchor: 'productImageSize', labelKey: 'settings.products.imageSize', keywords: 'image size small medium large ছবির আকার' },
  { section: 'products', anchor: 'productCardSize', labelKey: 'settings.products.cardSize', keywords: 'card size grid কার্ডের আকার' },
  { section: 'products', anchor: 'productSku', labelKey: 'settings.products.showSku', keywords: 'sku code এসকেইউ' },
  { section: 'products', anchor: 'productBarcode', labelKey: 'settings.products.showBarcode', keywords: 'barcode বারকোড' },
  { section: 'products', anchor: 'productStock', labelKey: 'settings.products.showStock', keywords: 'stock availability স্টক' },
  { section: 'products', anchor: 'productMrp', labelKey: 'settings.products.showMrp', keywords: 'mrp maximum retail price এমআরপি' },
  { section: 'products', anchor: 'productDiscount', labelKey: 'settings.products.showDiscount', keywords: 'discount badge offer ছাড় ব্যাজ' },
  { section: 'inventory', anchor: 'allowNegativeStock', labelKey: 'settings.inventory.allowNegative', keywords: 'negative stock sell without stock নেগেটিভ স্টক' },
  { section: 'inventory', anchor: 'defaultMinStock', labelKey: 'settings.inventory.minStock', keywords: 'minimum stock reorder low stock সর্বনিম্ন স্টক' },
  { section: 'inventory', anchor: 'defaultMaxStock', labelKey: 'settings.inventory.maxStock', keywords: 'maximum stock সর্বোচ্চ স্টক' },
  { section: 'inventory', anchor: 'trackExpiry', labelKey: 'settings.inventory.trackExpiry', keywords: 'expiry date batch মেয়াদ' },
  { section: 'inventory', anchor: 'expiryAlertDays', labelKey: 'settings.inventory.alertDays', keywords: 'expiring soon alert days মেয়াদোত্তীর্ণ সতর্কতা' },

  /* Shift */
  { section: 'shift', anchor: 'requireOpenShift', labelKey: 'settings.shift.requireOpen', keywords: 'shift open before selling শিফট খোলা' },
  { section: 'shift', anchor: 'defaultOpeningCash', labelKey: 'settings.shift.defaultOpening', keywords: 'opening cash float drawer প্রারম্ভিক নগদ' },
  { section: 'shift', anchor: 'maxCashDifference', labelKey: 'settings.shift.maxDifference', keywords: 'cash difference shortage over ঘাটতি পার্থক্য' },
  { section: 'shift', anchor: 'blindClose', labelKey: 'settings.shift.blindClose', keywords: 'blind close count expected cash গণনা' },
  { section: 'shift', anchor: 'shiftReminder', labelKey: 'settings.shift.reminder', keywords: 'shift reminder close শিফট রিমাইন্ডার' },

  /* Look & language */
  { section: 'appearance', anchor: 'density', labelKey: 'settings.appearance.density', keywords: 'density compact comfortable spacious ঘনত্ব' },
  { section: 'appearance', anchor: 'corners', labelKey: 'settings.appearance.corners', keywords: 'rounded corners radius কোণ' },
  { section: 'appearance', anchor: 'animations', labelKey: 'settings.appearance.animations', keywords: 'animation motion অ্যানিমেশন' },
  { section: 'appearance', anchor: 'hoverEffects', labelKey: 'settings.appearance.hover', keywords: 'hover effects হোভার' },
  { section: 'appearance', anchor: 'highContrast', labelKey: 'settings.appearance.highContrast', keywords: 'high contrast accessibility উচ্চ কনট্রাস্ট' },
  { section: 'appearance', anchor: 'textSize', labelKey: 'settings.appearance.textSize', keywords: 'text size font size bigger লেখার আকার' },
  { section: 'theme', anchor: 'themeMode', labelKey: 'settings.appearance.theme', keywords: 'dark light system theme mode ডার্ক লাইট থিম' },
  { section: 'theme', anchor: 'accent', labelKey: 'settings.theme.accent', keywords: 'accent colour color brand রং' },
  { section: 'fonts', anchor: 'uiFont', labelKey: 'settings.fonts.ui', keywords: 'font typeface ফন্ট' },
  { section: 'fonts', anchor: 'banglaFont', labelKey: 'settings.fonts.bangla', keywords: 'bangla font solaimanlipi hind siliguri noto বাংলা ফন্ট' },
  { section: 'fonts', anchor: 'receiptFont', labelKey: 'settings.fonts.receipt', keywords: 'receipt font রসিদের ফন্ট' },
  { section: 'language', anchor: 'language', labelKey: 'settings.language.interface', keywords: 'language bangla english ভাষা বাংলা ইংরেজি' },
  { section: 'language', anchor: 'bothNames', labelKey: 'settings.language.bothNames', keywords: 'product names both languages দুই ভাষায় নাম' },
  { section: 'numbers', anchor: 'numerals', labelKey: 'settings.numbers.digits', keywords: 'numbers digits bangla numerals সংখ্যা অঙ্ক' },
  { section: 'numbers', anchor: 'clock', labelKey: 'settings.numbers.clock', keywords: 'clock 12 24 hour time ঘড়ি সময়' },
  { section: 'currency', anchor: 'currencyCode', labelKey: 'settings.currency.code', keywords: 'currency bdt usd eur gbp taka মুদ্রা টাকা' },
  { section: 'currency', anchor: 'currencySymbol', labelKey: 'settings.currency.symbol', keywords: 'symbol ৳ $ € প্রতীক' },
  { section: 'currency', anchor: 'currencyDecimals', labelKey: 'settings.currency.decimals', keywords: 'decimals poisha দশমিক পয়সা' },

  /* Devices */
  { section: 'printer', anchor: 'receiptPrinter', labelKey: 'settings.printer.receiptPrinter', keywords: 'printer thermal receipt প্রিন্টার রসিদ' },
  { section: 'printer', anchor: 'a4Printer', labelKey: 'settings.printer.a4Printer', keywords: 'a4 printer report invoice প্রিন্টার' },
  { section: 'printer', anchor: 'silentPrint', labelKey: 'settings.printer.silent', keywords: 'silent print dialog নীরব প্রিন্ট' },
  { section: 'printer', anchor: 'autoPrint', labelKey: 'settings.printer.autoPrint', keywords: 'auto print receipt after sale স্বয়ংক্রিয় প্রিন্ট' },
  { section: 'printer', anchor: 'printerPaper', labelKey: 'settings.printer.paperWidth', keywords: 'paper width 80mm 58mm কাগজ' },
  { section: 'printer', anchor: 'printerCopies', labelKey: 'settings.printer.copies', keywords: 'copies কপি' },
  { section: 'printer', anchor: 'testPrint', labelKey: 'settings.printer.testButton', keywords: 'test print টেস্ট প্রিন্ট' },
  { section: 'barcode', anchor: 'scanSpeed', labelKey: 'settings.barcode.speed', keywords: 'scanner speed usb বারকোড স্ক্যানার গতি' },
  { section: 'barcode', anchor: 'scanTerminator', labelKey: 'settings.barcode.terminator', keywords: 'enter tab suffix terminator এন্টার' },
  { section: 'barcode', anchor: 'unknownBarcode', labelKey: 'settings.barcode.unknown', keywords: 'unknown barcode not found অজানা বারকোড' },
  { section: 'barcode', anchor: 'scanTest', labelKey: 'settings.barcode.test', keywords: 'test scanner পরীক্ষা' },
  { section: 'sounds', anchor: 'soundEnabled', labelKey: 'settings.sounds.enabled', keywords: 'sound audio mute শব্দ' },
  { section: 'sounds', anchor: 'soundVolume', labelKey: 'settings.sounds.volume', keywords: 'volume loud ভলিউম' },
  { section: 'sounds', anchor: 'sound-scan', labelKey: 'settings.sounds.scan', keywords: 'scan beep বিপ' },
  { section: 'sounds', anchor: 'sound-error', labelKey: 'settings.sounds.error', keywords: 'error sound buzzer ত্রুটি' },

  /* System */
  { section: 'notifications', anchor: 'notify-lowStock', labelKey: 'settings.notifications.lowStock', keywords: 'low stock alert কম স্টক' },
  { section: 'notifications', anchor: 'notify-outOfStock', labelKey: 'settings.notifications.outOfStock', keywords: 'out of stock alert স্টক শেষ' },
  { section: 'notifications', anchor: 'notify-expiring', labelKey: 'settings.notifications.expiring', keywords: 'expiring alert মেয়াদ' },
  { section: 'notifications', anchor: 'notify-backupReminder', labelKey: 'settings.notifications.backupReminder', keywords: 'backup reminder ব্যাকআপ' },
  { section: 'notifications', anchor: 'desktopNotifications', labelKey: 'settings.notifications.desktop', keywords: 'windows desktop notification উইন্ডোজ নোটিফিকেশন' },
  { section: 'security', anchor: 'approvePriceOverride', labelKey: 'settings.security.priceOverride', keywords: 'manager approval price অনুমোদন দাম' },
  { section: 'security', anchor: 'approveCancel', labelKey: 'settings.security.cancel', keywords: 'manager approval cancel অনুমোদন বাতিল' },
  { section: 'security', anchor: 'autoLock', labelKey: 'settings.security.autoLock', keywords: 'auto lock screen idle লক' },
  { section: 'security', anchor: 'pinLength', labelKey: 'settings.security.pinLength', keywords: 'pin length password পিন' },
  { section: 'users', anchor: 'staffAccounts', labelKey: 'settings.users.staff', keywords: 'users staff cashier account add user ব্যবহারকারী কর্মী ক্যাশিয়ার' },
  { section: 'users', anchor: 'permissionMatrix', labelKey: 'settings.users.matrix', keywords: 'permissions roles admin manager cashier অনুমতি ভূমিকা' },
  { section: 'data', anchor: 'backupNow', labelKey: 'settings.data.backupNow', keywords: 'backup export json ব্যাকআপ' },
  { section: 'data', anchor: 'restoreBackup', labelKey: 'settings.data.restore', keywords: 'restore import backup রিস্টোর ইমপোর্ট' },
  { section: 'data', anchor: 'resetDemo', labelKey: 'settings.data.resetDemo', keywords: 'reset demo data ডেমো ডেটা রিসেট' },
  { section: 'data', anchor: 'generateMore', labelKey: 'settings.data.generateMore', keywords: 'generate demo sales ডেমো বিক্রয়' },
  { section: 'data', anchor: 'clearAll', labelKey: 'settings.data.clearAll', keywords: 'delete clear all data মুছে ফেলা' },
  { section: 'about', anchor: 'appVersion', labelKey: 'settings.about.app', keywords: 'version about update সংস্করণ' },
  { section: 'about', anchor: 'dataFolder', labelKey: 'settings.about.dataFolder', keywords: 'data folder database location ফোল্ডার' },
  { section: 'about', anchor: 'developer', labelKey: 'settings.about.developer', keywords: 'developer contact email support ডেভেলপার যোগাযোগ ইমেইল' },
];
