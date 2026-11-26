'use strict';

const $ = sel => document.querySelector(sel);

/* =====================================================================
   i18n (EN / AR)
   - Static texts:  data-i18n="key"                      -> textContent
   - Attributes:    data-i18n-attr="placeholder:key;aria-label:key2"
   - Dynamic texts: t('key', { vars })
   Only textContent / setAttribute are used (never innerHTML), so the
   existing XSS protections are untouched.
   Unsplash search keywords are NOT translated (they stay English).
   ===================================================================== */

const LANG_KEY = 'greenWingsLang';
const LANGS = ['en', 'ar'];
const I18N_ATTRS = new Set(['placeholder', 'aria-label', 'alt', 'title', 'content']);   // whitelist
const THUMB_WIDTH = 300;
// \u2066 ... \u2069 = invisible "keep left-to-right" isolates, so numbers / file names don't get scrambled in RTL text.
const TRANSLATIONS = {
    en: {
        section_latest: 'Discover Nature Wallpapers',     // en
        doc_title: 'Green Wings - HD Wallpapers',
        no_results: 'Sorry, we couldn\'t find any results for this search. Please try different keywords.',
        meta_desc: 'Free high-definition nature wallpapers: mountains, forests and oceans.',
        lang_aria: 'Language',
        nav_aria: 'Main',
        menu: 'Menu',
        footer_impressum: 'Impressum',
        impressum_title: 'Impressum (Legal Notice)',
        impressum_note: 'Shown in German and English, as required for German websites (§ 5 DDG).',
        detail_dimensions: 'Dimensions',
        detail_quality: 'Quality',
        nav_home: 'Home',
        nav_forests: 'Forests',
        nav_mountains: 'Mountains',
        nav_oceans: 'Oceans',
        nav_favorites: 'Favorites',
        search_placeholder: 'Search wallpapers...',
        search_aria: 'Search wallpapers',
        search_btn: 'Search',
        theme_to_light: 'Switch to light mode',
        theme_to_dark: 'Switch to dark mode',
        upload: 'Upload',
        upload_choose: 'Choose Wallpaper (e.g. Alps Mountain.jpg)',
        upload_title_ph: 'Wallpaper Title',
        upload_title_aria: 'Wallpaper title',
        upload_desc_ph: 'Short Description',
        upload_desc_aria: 'Short description',
        upload_submit: 'Upload & Submit',
        upload_note: 'Uploads are published after a quick review.',
        hero_title: 'Bring Nature\'s Beauty to your Screen',
        hero_desc: 'Discover and download thousands of free high-definition wallpapers of majestic mountains and mysterious forests.',
        section_favorites: 'Your favorites',
        results_for: 'Results for “{q}”',
        orient_aria: 'Orientation',
        orient_all: 'All',
        orient_landscape: 'Landscape',
        orient_portrait: 'Portrait',
        card1_title: 'Sunlight Through Trees',
        card1_desc: 'Stunning photography of dense Amazon rainforests.',
        card2_title: 'Alps Mountain Peaks',
        card2_desc: 'Breathtaking snow-capped mountain backdrop at sunset.',
        card3_title: 'Magical Green Valley',
        card3_desc: 'A crystal clear lake reflecting pure New Zealand nature.',
        dl_full: 'Download Full Size',
        dl_screen: 'Download for my screen ({w}×{h})',
        dl_original: 'Download original',
        downloading: 'Downloading...',
        dl_ok: 'Download successful! You can now set it as your device wallpaper from your downloads folder.',
        dl_fail: 'Download failed, so the image opened in a new tab. Long-press or right-click it to save.',
        load_more: 'Load more',
        loading: 'Loading...',
        try_again: 'Try again',
        contact_title: 'Contact Us',
        contact_sub: 'Have feedback or a wallpaper request? Send us a message.',
        name_ph: 'Write your name here',
        name_aria: 'Your name',
        msg_ph: 'Write your message here',
        msg_aria: 'Your message',
        send_btn: 'Send Now!',
        footer: 'Made with love for nature lovers 2026 | Green Wings Wallpapers',
        modal_aria: 'Wallpaper preview',
        close_preview: 'Close preview',
        prev_wp: 'Previous wallpaper',
        next_wp: 'Next wallpaper',
        back_top: 'Go to top',
        fav_add: 'Add to favorites',
        fav_remove: 'Remove from favorites',
        photo_by: 'Photo by {name} on {site}',
        by_name: 'By {name}',
        unknown: 'Unknown',
        wp_default: 'Nature Wallpaper',
        wp_untitled: 'Untitled Wallpaper',
        sub_favorite: 'Favorite',
        sub_uploaded: 'Uploaded by a Green Wings visitor',
        empty_search_h: 'No Nature Wallpapers Found',
        empty_search_t: 'We couldn\'t find a match for that search. Try a keyword like "forest", "mountains", "ocean" or "sunset" instead.',
        empty_fav_h: 'No Favorites Yet',
        empty_fav_t: 'Tap the heart on any wallpaper to save it here.',
        err_more: 'Could not load more wallpapers.',
        err_server: 'Failed to load images from server.',
        err_generic: 'Sorry, unable to load images at the moment.',
        no_more: 'No more wallpapers found for this search.',
        enter_keyword: 'Please enter a keyword to search!',
        fill_contact: 'Please enter your name and message first!',
        contact_ok: 'Thank you! Your message has been sent. We will get back to you soon.',
        contact_err: 'An error occurred while sending your message.',
        server_err: 'Could not connect to the server; ensure that it is running.',
        upload_pick: 'Please choose an image file to upload.',
        upload_type: 'Only JPG, PNG or WEBP images can be uploaded.',
        upload_big: 'That image is too large (max 10 MB).',
        uploading: 'Uploading...',
        upload_fail: 'Upload failed',
        upload_ok: 'Thank you! Your wallpaper was uploaded and will appear after it has been reviewed.',
        upload_generic: 'Something went wrong during upload.',
        fav_storage: 'Could not save favorites (storage unavailable).',
        share_link: 'Copy link',
        link_copied: 'Link copied',
        photo_missing: 'This photo is no longer available.',
        wotd_title: 'Wallpaper of the Day',
        wotd_view: 'View wallpaper',
        wotd_open_aria: 'Open Wallpaper of the Day: {title}',
        // Quick filter pills (labels only: the search keywords stay English in data-category)
        cat_aria: 'Categories',
        cat_all: 'All',
        cat_forests: 'Forests',
        cat_mountains: 'Mountains',
        cat_nature: 'Nature',
        cat_sky: 'Sky',
        cat_water: 'Water',
        cat_oceans: 'Oceans',
        cat_minimal: 'Minimal',
        cat_night: 'Night',
        cat_abstract: 'Abstract',
        // Dominant color filter
        color_aria: 'Filter by color',
        color_all: 'All colors',
        color_green: 'Green',
        color_black: 'Black',
        color_white: 'White',
        color_blue: 'Blue',
        color_orange: 'Orange',
        color_purple: 'Purple',
        color_neutral: 'Neutral / Earth',
        color_none: 'No wallpapers match this color yet. Try another color.',
        color_no_more: 'No more wallpapers in this color for this search.',

        // Footer, About, Privacy, support
        footer_nav_aria: 'Footer',
        footer_about: 'About',
        footer_privacy: 'Privacy Policy',
        support_btn: 'Buy me a coffee',
        support_aria: 'Buy me a coffee on Ko-fi (opens in a new tab)',
        info_close: 'Close',
        about_title: 'About Green Wings',
        about_lead: 'Green Wings Wallpapers is a fast, privacy-friendly home for curated 4K nature and aesthetic wallpapers: forests, mountains, oceans, quiet skies and minimal scenes.',
        about_h_found: 'What you’ll find',
        about_f1: 'Free high-definition wallpapers, sized for your screen when you download.',
        about_f2: 'Built-in tools: Gradient Studio for custom gradient wallpapers, background blur and a Wallpaper of the Day.',
        about_f3: 'Search, color and orientation filters, and favorites saved on your device.',
        about_f4: 'Dark and light themes, English and Arabic, and offline support as an installable app.',
        about_h_credits: 'Photo credits',
        about_credits: 'Most photos come from Unsplash and are credited to their photographers. Visitors can also upload wallpapers, which are published after a quick review.',
        privacy_title: 'Privacy Policy',
        privacy_updated: 'Last updated: November 2026',
        privacy_lead: 'Short version: Green Wings respects your privacy. There are no accounts, no ads, no analytics and no tracking cookies, and we don’t collect personal data about you as you browse.',
        privacy_h1: 'What stays on your device',
        privacy_p1: 'To work properly, the site uses your browser’s local storage and cache for your favorites, your theme, language and orientation choices, a short-lived color cache, and the offline files that make the app load fast. This data never leaves your device, and you can clear it at any time in your browser settings.',
        privacy_h2: 'What you choose to send',
        privacy_p2: 'If you send a message through the contact form, we receive your name and your message. They are stored in a database hosted by Supabase (PostgreSQL) solely to respond to your inquiry, and are never shared with third parties for marketing.',
        privacy_p2b: 'If you upload a wallpaper, the image file and its details (title, description and dimensions) are stored with Supabase (Storage and Database). Approved uploads are published after review, so anyone can see them.',
        privacy_h3: 'Technical data and third parties',
        privacy_p3a: 'Wallpapers are loaded from Unsplash. As with any image hosted elsewhere, Unsplash can see basic technical details such as your IP address when your browser requests a photo. Downloads are counted with Unsplash as its guidelines require, without sharing personal information about you. The site’s fonts are hosted on our own server.',
        privacy_p3c: 'Supabase hosts our database and file storage and acts as our data processor: it handles data only on our behalf and instructions. Uploaded wallpapers load directly from Supabase Storage, so, as with Unsplash, Supabase can see basic technical details such as your IP address when your browser requests them.',
        privacy_p3b: 'Like most websites, our server may briefly process technical request data, such as your IP address, to deliver pages and prevent abuse. We don’t use it to track you or build a profile.',
        privacy_h4: 'Your rights and contact',
        privacy_p4: 'Clear this site’s data in your browser at any time to erase everything stored locally. For any privacy question, use the Contact Us form on this page.',
        privacy_p4b: 'You can ask us at any time to delete your submitted messages or uploaded wallpapers, using the contact email in the Impressum (linked in the footer). You also have the right to access and correct your data and to lodge a complaint with a data protection authority.'

    },
    ar: {
        doc_title: 'Green Wings - خلفيات عالية الدقة',
        no_results: 'عذراً، لم نتمكن من العثور على أي نتائج لعملية البحث هذه. يرجى تجربة كلمات أخرى.',
        meta_desc: 'خلفيات طبيعية مجانية عالية الدقة: جبال وغابات ومحيطات.',
        lang_aria: 'اللغة',
        nav_aria: 'التنقل الرئيسي',
        nav_home: 'الرئيسية',
        nav_forests: 'الغابات',
        nav_mountains: 'الجبال',
        nav_oceans: 'المحيطات',
        nav_favorites: 'المفضلة',
        search_placeholder: 'ابحث عن خلفيات...',
        search_aria: 'ابحث عن خلفيات',
        menu: 'القائمة',
        detail_dimensions: 'الأبعاد',
        detail_quality: 'الجودة',
        search_btn: 'بحث',
        footer_impressum: 'Impressum',
        impressum_title: 'البيانات القانونية (\u2066Impressum\u2069)',
        impressum_note: 'يُعرض باللغتين الألمانية والإنجليزية وفق متطلبات القانون الألماني (\u2066§ 5 DDG\u2069).',
        theme_to_light: 'التبديل إلى الوضع الفاتح',
        theme_to_dark: 'التبديل إلى الوضع الداكن',
        upload: 'رفع',
        upload_choose: 'اختر خلفية (مثال: \u2066Alps Mountain.jpg\u2069)',
        upload_title_ph: 'عنوان الخلفية',
        upload_title_aria: 'عنوان الخلفية',
        upload_desc_ph: 'وصف قصير',
        upload_desc_aria: 'وصف قصير',
        upload_submit: 'رفع وإرسال',
        upload_note: 'تُنشر الصور المرفوعة بعد مراجعة سريعة.',
        hero_title: 'اجعل جمال الطبيعة على شاشتك',
        hero_desc: 'اكتشف وحمّل آلاف الخلفيات المجانية عالية الدقة للجبال المهيبة والغابات الغامضة.',
        section_latest: 'أحدث خلفيات الطبيعة',
        section_favorites: 'مفضلتك',
        results_for: 'نتائج “{q}”',
        orient_aria: 'الاتجاه',
        orient_all: 'الكل',
        orient_landscape: 'أفقي',
        orient_portrait: ' عمودي',
        card1_title: 'أشعة الشمس بين الأشجار',
        card1_desc: 'تصوير مذهل لغابات الأمازون المطيرة الكثيفة.',
        card2_title: 'قمم جبال الألب',
        card2_desc: 'خلفية جبلية خلابة مكسوّة بالثلوج عند الغروب.',
        card3_title: 'الوادي الأخضر الساحر',
        card3_desc: 'بحيرة صافية كالبلّور تعكس طبيعة نيوزيلندا النقية.',
        dl_full: 'تنزيل بالحجم الكامل',
        dl_screen: 'تنزيل لشاشتي (\u2066{w}×{h}\u2069)',
        dl_original: 'تنزيل النسخة الأصلية',
        downloading: 'جارٍ التنزيل...',
        dl_ok: 'تم التنزيل بنجاح! يمكنك الآن تعيينه كخلفية لجهازك من مجلد التنزيلات.',
        dl_fail: 'فشل التنزيل، لذلك فُتحت الصورة في تبويب جديد. اضغط مطولًا أو انقر بزر الفأرة الأيمن عليها لحفظها.',
        load_more: 'عرض المزيد',
        loading: 'جارٍ التحميل...',
        try_again: 'حاول مرة أخرى',
        contact_title: 'اتصل بنا',
        contact_sub: 'لديك ملاحظات أو طلب خلفية؟ أرسل لنا رسالة.',
        name_ph: 'اكتب اسمك هنا',
        name_aria: 'اسمك',
        msg_ph: 'اكتب رسالتك هنا',
        photo_missing: 'هذه الصورة لم تعد متاحة.',
        wotd_title: 'خلفية اليوم',
        wotd_view: 'عرض الخلفية',
        wotd_open_aria: 'فتح خلفية اليوم: {title}',
        msg_aria: 'رسالتك',
        send_btn: 'أرسل الآن!',
        footer: 'صُنع بحب لعشّاق الطبيعة 2026 | Green Wings Wallpapers',
        modal_aria: 'معاينة الخلفية',
        close_preview: 'إغلاق المعاينة',
        prev_wp: 'الخلفية السابقة',
        next_wp: 'الخلفية التالية',
        back_top: 'العودة إلى الأعلى',
        fav_add: 'إضافة إلى المفضلة',
        fav_remove: 'إزالة من المفضلة',
        photo_by: 'تصوير {name} على {site}',
        by_name: 'بواسطة {name}',
        unknown: 'غير معروف',
        wp_default: 'خلفية طبيعية',
        wp_untitled: 'خلفية بدون عنوان',
        sub_favorite: 'مفضلة',
        sub_uploaded: 'رفعها أحد زوار Green Wings',
        empty_search_h: 'لم يتم العثور على خلفيات',
        empty_search_t: 'لم نجد نتائج مطابقة لبحثك. جرّب كلمة إنجليزية مثل "forest" أو "mountains" أو "ocean" أو "sunset".',
        empty_fav_h: 'لا توجد مفضلة بعد',
        empty_fav_t: 'اضغط على القلب في أي خلفية لحفظها هنا.',
        err_more: 'تعذّر تحميل المزيد من الخلفيات.',
        err_server: 'فشل تحميل الصور من الخادم.',
        err_generic: 'عذرًا، تعذّر تحميل الصور حاليًا.',
        no_more: 'لا توجد خلفيات أخرى لهذا البحث.',
        enter_keyword: 'الرجاء إدخال كلمة للبحث!',
        fill_contact: 'الرجاء إدخال اسمك ورسالتك أولًا!',
        contact_ok: 'شكرًا لك! تم إرسال رسالتك وسنعاود الاتصال بك قريبًا.',
        contact_err: 'حدث خطأ أثناء إرسال رسالتك.',
        server_err: 'تعذّر الاتصال بالخادم؛ تأكد من أنه يعمل.',
        upload_pick: 'الرجاء اختيار صورة لرفعها.',
        upload_type: 'يمكن رفع صور JPG أو PNG أو WEBP فقط.',
        upload_big: 'الصورة كبيرة جدًا (الحد الأقصى 10 ميغابايت).',
        uploading: 'جارٍ الرفع...',
        upload_fail: 'فشل الرفع',
        upload_ok: 'شكرًا لك! تم رفع خلفيتك وستظهر بعد مراجعتها.',
        upload_generic: 'حدث خطأ أثناء الرفع.',
        fav_storage: 'تعذّر حفظ المفضلة (التخزين غير متاح).',
        share_link: 'نسخ الرابط',
        link_copied: 'تم نسخ الرابط',
        // Quick filter pills
        cat_aria: 'الفئات',
        cat_all: 'الكل',
        cat_forests: 'غابات',
        cat_mountains: 'جبال',
        cat_nature: 'طبيعة',
        cat_sky: 'سماء',
        cat_water: 'مياه',
        cat_oceans: 'محيطات',
        cat_minimal: 'بسيط',
        cat_night: 'ليلي',
        cat_abstract: 'تجريدي',
        // Dominant color filter
        color_aria: 'التصفية حسب اللون',
        color_all: 'كل الألوان',
        color_green: 'أخضر',
        color_black: 'أسود',
        color_white: 'أبيض',
        color_blue: 'أزرق',
        color_orange: 'برتقالي',
        color_purple: 'بنفسجي',
        color_neutral: 'محايد / ترابي',
        color_none: 'لا توجد خلفيات بهذا اللون حتى الآن. جرّب لونًا آخر.',
        color_no_more: 'لا توجد خلفيات أخرى بهذا اللون لهذا البحث.',

        // التذييل، حول الموقع، الخصوصية، الدعم
        footer_nav_aria: 'التذييل',
        footer_about: 'حول الموقع',
        footer_privacy: 'سياسة الخصوصية',
        support_btn: 'ادعمني بقهوة',
        support_aria: 'ادعمني بقهوة على \u2066Ko-fi\u2069 (يفتح في تبويب جديد)',
        info_close: 'إغلاق',
        about_title: 'حول \u2066Green Wings\u2069',
        about_lead: '\u2066Green Wings Wallpapers\u2069 موقع سريع يحترم خصوصيتك، يضم خلفيات منتقاة بدقة 4K للطبيعة والمشاهد الجمالية: غابات وجبال ومحيطات وسماء هادئة ومناظر بسيطة.',
        about_h_found: 'ماذا ستجد هنا',
        about_f1: 'خلفيات مجانية عالية الدقة، تُنزَّل بحجم يناسب شاشتك.',
        about_f2: 'أدوات مدمجة: \u2066Gradient Studio\u2069 لصنع خلفيات متدرجة بألوانك، وأداة تمويه الخلفية، وخلفية اليوم.',
        about_f3: 'بحث ومرشحات للألوان والاتجاه، ومفضلة تُحفظ على جهازك.',
        about_f4: 'وضع داكن وفاتح، وواجهة بالعربية والإنجليزية، ودعم العمل دون اتصال كتطبيق قابل للتثبيت.',
        about_h_credits: 'حقوق الصور',
        about_credits: 'تأتي معظم الصور من \u2066Unsplash\u2069 وتُنسب إلى مصوّريها. ويمكن للزوار أيضًا رفع خلفياتهم، وتُنشر بعد مراجعة سريعة.',
        privacy_title: 'سياسة الخصوصية',
        privacy_updated: 'آخر تحديث: نوفمبر 2026',
        privacy_lead: 'باختصار: يحترم \u2066Green Wings\u2069 خصوصيتك. لا توجد حسابات ولا إعلانات ولا أدوات تحليل ولا ملفات تعريف ارتباط للتتبع، ولا نجمع أي بيانات شخصية عنك أثناء التصفح.',
        privacy_h1: 'ما يبقى على جهازك',
        privacy_p1: 'لكي يعمل الموقع بشكل سليم، يستخدم التخزين المحلي وذاكرة التخزين المؤقت في متصفحك لحفظ مفضلتك، واختياراتك للمظهر واللغة والاتجاه، وذاكرة ألوان قصيرة الأمد، وملفات العمل دون اتصال التي تجعل التطبيق يفتح بسرعة. لا تغادر هذه البيانات جهازك أبدًا، ويمكنك مسحها في أي وقت من إعدادات المتصفح.',
        privacy_h2: 'ما ترسله بإرادتك',
        privacy_p2: 'إذا أرسلت رسالة عبر نموذج التواصل، فإننا نستلم اسمك ورسالتك. تُخزَّن في قاعدة بيانات مستضافة لدى \u2066Supabase\u2069 (\u2066PostgreSQL\u2069) للرد على استفسارك فقط، ولا تُشارك مع أي جهة خارجية لأغراض تسويقية.',
        privacy_p2b: 'إذا رفعت خلفية، فإن ملف الصورة وبياناتها (العنوان والوصف والأبعاد) تُخزَّن لدى \u2066Supabase\u2069 (التخزين وقاعدة البيانات). تُنشر الصور المعتمدة بعد المراجعة، ويمكن لأي زائر رؤيتها.',
        privacy_h3: 'البيانات التقنية والجهات الخارجية',
        privacy_p3a: 'تُحمَّل الخلفيات من \u2066Unsplash\u2069، وكما هو الحال مع أي صورة مستضافة لدى جهة أخرى، قد ترى هذه الجهة بيانات تقنية أساسية مثل عنوان \u2066IP\u2069 عندما يطلب متصفحك الصورة. ويُحتسب عدد التنزيلات لدى \u2066Unsplash\u2069 وفق إرشاداتها دون مشاركة أي معلومات شخصية عنك. وخطوط الموقع مستضافة على خادمنا نفسه.',
        privacy_p3c: 'تستضيف \u2066Supabase\u2069 قاعدة بياناتنا وملفاتنا وتعمل بصفتها معالِجًا للبيانات نيابةً عنا ووفق تعليماتنا فقط. وتُحمَّل الخلفيات المرفوعة مباشرة من \u2066Supabase Storage\u2069، لذلك قد ترى \u2066Supabase\u2069 عنوان \u2066IP\u2069 الخاص بك عندما يطلبها متصفحك، كما هو الحال مع \u2066Unsplash\u2069.',
        privacy_p3b: 'وكما تفعل معظم المواقع، قد يعالج خادمنا بيانات الطلبات التقنية مثل عنوان \u2066IP\u2069 لفترة وجيزة لتقديم الصفحات ومنع إساءة الاستخدام. ولا نستخدمها لتتبعك أو لبناء ملف عنك.',
        privacy_h4: 'حقوقك والتواصل',
        privacy_p4: 'يمكنك مسح بيانات هذا الموقع من متصفحك في أي وقت لحذف كل ما خُزّن محليًا. ولأي سؤال عن الخصوصية، استخدم نموذج «اتصل بنا» في هذه الصفحة.',
        privacy_p4b: 'يمكنك في أي وقت طلب حذف رسائلك المرسلة أو خلفياتك المرفوعة عبر البريد الإلكتروني المذكور في صفحة \u2066Impressum\u2069 (الرابط في التذييل). ولك أيضًا الحق في الاطلاع على بياناتك وتصحيحها وتقديم شكوى إلى جهة حماية البيانات المختصة.'
    }
};

function loadLang() {
    try {
        const v = localStorage.getItem(LANG_KEY);
        return LANGS.includes(v) ? v : 'en';
    } catch { return 'en'; }
}

let lang = loadLang();

// t('key', { name: 'x' }) -> translated string ({name} placeholders replaced). Falls back to English, then to the key.
function t(key, vars) {
    let s = (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]);
    if (s === undefined) s = TRANSLATIONS.en[key];
    if (s === undefined) s = key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    return s;
}

// Translates every [data-i18n] / [data-i18n-attr] element inside `root`.
function applyI18n(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => {
        let vars;
        if (el.dataset.i18nVars) {
            try { vars = JSON.parse(el.dataset.i18nVars); } catch { /* ignore bad JSON */ }
        }
        el.textContent = t(el.dataset.i18n, vars);
    });
    root.querySelectorAll('[data-i18n-attr]').forEach(el => {
        el.dataset.i18nAttr.split(';').forEach(pair => {
            const [attr, key] = pair.split(':').map(s => s.trim());
            if (attr && key && I18N_ATTRS.has(attr)) el.setAttribute(attr, t(key));
        });
    });
}

/* ---------- DOM references ---------- */

const searchForm = $('#search-form');
const searchInput = $('#search-input');
const container = $('.grid-layout');
const sectionTitle = $('#section-title');
const loadMoreBtn = $('#loadMoreBtn');
const loadSentinel = $('#load-sentinel');          // invisible marker under the grid (infinite scroll)
const orientationBar = $('#orientation-filter');
const categoryBar = $('#category-pills');          // Quick Filter Pills row (above the grid)
const filterBar = $('#filter-bar');                // pills + color swatches (hidden together on Favorites)
const colorBar = $('#color-filter');               // Dominant Color swatches
const colorEmpty = $('#color-empty');              // "nothing in this color" note under the grid
const hero = $('.hero-section');
const header = $('.main-header');
const uploadDetails = $('.upload-trigger-wrapper');
const themeToggle = $('#themeToggle');
const wotdSection = $('#wotd');                    // "Wallpaper of the Day" banner (home view only)
const wotdCard = $('#wotd-card');

// Snapshot of the static cards (ENGLISH source text) so "Home" can restore them; they are translated again after restoring.
const HOME_HTML = container.innerHTML;
const MAX_EMPTY_RUNS = 3;                  // fully-duplicate / fully-filtered pages "Load more" skips automatically
const THUMB_WIDTHS = [400, 800, 1200, 1600];
const THUMB_Q = 80;
// Conservative estimate of the card width at each breakpoint (it never under-estimates, so images stay sharp).
const THUMB_SIZES = '(max-width: 650px) 100vw, (max-width: 1100px) 46vw, (max-width: 1500px) 32vw, 400px';

const thumbSrcset = raw =>
    THUMB_WIDTHS.map(w => `${sizedUrl(raw, { w, q: THUMB_Q, fm: 'webp', fit: 'max' })} ${w}w`).join(', ');// card images
const MAX_SCREEN_EDGE = 3840;              // "download for my screen" never exceeds 4K
const MAX_QUERY_LENGTH = 100;              // same limit as the search input's maxlength
const UTM = { utm_source: 'green_wings', utm_medium: 'referral' };   // required by Unsplash for attribution links
// Arabic heading only: search keyword -> translation key. Keywords without an entry just show the keyword itself.
const QUERY_LABELS = {
    forests: 'nav_forests', mountains: 'nav_mountains', oceans: 'nav_oceans',
    nature: 'cat_nature', sky: 'cat_sky', water: 'cat_water',
    minimal: 'cat_minimal', night: 'cat_night', abstract: 'cat_abstract'
};

// No API key here: the server talks to Unsplash (GET /api/photos).

/* ---------- header height -> CSS variable ---------- */

function syncHeaderHeight() {
    document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
}
syncHeaderHeight();
if ('ResizeObserver' in window) {
    new ResizeObserver(syncHeaderHeight).observe(header);
} else {
    window.addEventListener('resize', syncHeaderHeight);
}

/* ---------- toast ---------- */

const TOAST_MS = 3500;
let toastTimer = null;

function dismissToast(toast) {
    if (!toast.isConnected) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof toast.animate !== 'function') { toast.remove(); return; }
    toast.animate(
        [
            { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
            { opacity: 0, transform: 'translateX(-50%) translateY(10px)' }
        ],
        { duration: 250, easing: 'ease-in', fill: 'forwards' }
    ).onfinish = () => toast.remove();
}

function showToast(message, isError = false) {
    clearTimeout(toastTimer);
    document.querySelectorAll('.toast-notification').forEach(el => el.remove());

    const toast = document.createElement('div');
    toast.className = 'toast-notification' + (isError ? ' toast-error' : '');
    toast.setAttribute('role', isError ? 'alert' : 'status');
    toast.textContent = message;
    toast.addEventListener('click', () => { clearTimeout(toastTimer); dismissToast(toast); });
    document.body.appendChild(toast);

    toastTimer = setTimeout(() => dismissToast(toast), TOAST_MS);   // fades out after 3.5 s
}

/* ---------- URL helpers (Unsplash images) ---------- */

const isUnsplashHost = u => u.hostname === 'unsplash.com' || u.hostname.endsWith('.unsplash.com');

// Adds/overrides imgix parameters (w, h, q, fm, fit ...) on an Unsplash image URL.
function sizedUrl(url, params) {
    try {
        const u = new URL(url, location.href);
        if (!isUnsplashHost(u)) return url;
        Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, String(v)));
        return u.toString();
    } catch { return url; }
}

// Stable identity of a photo. Unsplash URLs carry changing query params (ixid ...), so only the path counts.
function photoKey(url) {
    try {
        const u = new URL(url, location.href);
        if (isUnsplashHost(u)) return u.origin + u.pathname;
    } catch { /* fall through */ }
    return url;
}

// Only https links to unsplash.com, with the required UTM parameters (also blocks javascript: URLs).
function unsplashLink(url) {
    try {
        const u = new URL(url);
        if (u.protocol !== 'https:' || !isUnsplashHost(u)) return null;
        Object.entries(UTM).forEach(([k, v]) => u.searchParams.set(k, v));
        return u.toString();
    } catch { return null; }
}

/* ---------- smart download: sized for THIS device's screen ---------- */

function deviceIsLandscape(fallback) {
    if (screen.orientation && screen.orientation.type) return screen.orientation.type.startsWith('landscape');
    if (typeof window.orientation === 'number') return Math.abs(window.orientation) === 90;   // older iOS
    return fallback;
}

function screenTarget() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    let w = Math.round(screen.width * dpr);
    let h = Math.round(screen.height * dpr);
    if (deviceIsLandscape(w > h) !== (w > h)) [w, h] = [h, w];   // make w/h follow the real device orientation
    const longEdge = Math.max(w, h);
    if (longEdge > MAX_SCREEN_EDGE) {
        const k = MAX_SCREEN_EDGE / longEdge;
        w = Math.round(w * k);
        h = Math.round(h * k);
    }
    return { w, h };
}

// Never larger than the photo itself (no upscaling), always the exact aspect ratio of the screen.
function smartSize(meta) {
    const target = screenTarget();
    let k = 1;
    if (meta.width && meta.height) k = Math.min(1, meta.width / target.w, meta.height / target.h);
    return { w: Math.max(1, Math.floor(target.w * k)), h: Math.max(1, Math.floor(target.h * k)) };
}

// FALLBACK only: asks the image server to crop to w x h. Used when the in-browser crop below is not possible.
function smartUrl(meta, size) {
    return sizedUrl(meta.rawUrl, { w: size.w, h: size.h, fit: 'crop', crop: 'entropy', fm: 'jpg', q: 85 });
}

/* ---- Aspect-ratio-safe crop (fixes stretched / distorted "download for my screen" images) ----
   1. Download the photo at its TRUE proportions (only `w` is sent, with fit=max: the server never crops or
      resizes one side on its own), at a size that is just big enough to cover the screen.
   2. Cut a centred window with exactly the screen's proportions out of it ("cover" crop).
   3. Draw that window 1:1 into a canvas of exactly screen size. Source window and canvas share the same
      ratio, so no pixel is ever stretched. */

// createImageBitmap needs no blob: URL, so it works under the strict CSP (img-src has no blob:),
// and it decodes off the main thread. The <img> + blob: path is only a fallback for very old browsers.
async function decodeImage(blob) {
    if ('createImageBitmap' in window) {
        try { return await createImageBitmap(blob); } catch { /* fall back below */ }
    }
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(objectUrl); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Could not decode image')); };
        img.src = objectUrl;
    });
}

// Largest centred rectangle of the source that has the destination's aspect ratio.
function coverRect(srcW, srcH, dstW, dstH) {
    const dstRatio = dstW / dstH;
    let sw, sh;
    if (srcW / srcH > dstRatio) {          // source is wider than the target: trim the sides
        sh = srcH;
        sw = srcH * dstRatio;
    } else {                               // source is taller than the target: trim top and bottom
        sw = srcW;
        sh = srcW / dstRatio;
    }
    return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

// Returns a JPEG Blob of exactly size.w x size.h, or null when the original size is unknown.
async function buildScreenBlob(meta, size) {
    if (!meta.width || !meta.height) return null;

    // Smallest scale that still covers the screen (never above 1 = never upscaled).
    const scale = Math.min(1, Math.max(size.w / meta.width, size.h / meta.height));
    const sourceWidth = Math.max(1, Math.ceil(meta.width * scale));
    const sourceUrl = sizedUrl(meta.rawUrl, { w: sourceWidth, fit: 'max', fm: 'jpg', q: 90 });

    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error('Source image request failed');
    const img = await decodeImage(await response.blob());   // ImageBitmap (or a detached <img> on old browsers)

    const canvas = document.createElement('canvas');
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        if (typeof img.close === 'function') img.close();
        throw new Error('Canvas not available');
    }

    // ImageBitmap has width/height; an <img> has naturalWidth/naturalHeight.
    const { sx, sy, sw, sh } = coverRect(img.naturalWidth || img.width, img.naturalHeight || img.height, size.w, size.h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size.w, size.h);
    if (typeof img.close === 'function') img.close();       // frees the decoded bitmap (ImageBitmap only)

    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/jpeg', 0.92);
    });
    canvas.width = canvas.height = 0;      // release the pixel buffer (matters on iPad / iPhone)
    return blob;
}

const lightboxWidth = () =>
    Math.max(1080, Math.min(2560, Math.round(window.innerWidth * Math.min(window.devicePixelRatio || 1, 2))));

/* ---------- blur-up placeholders ----------
   Every card shows a tiny blurred picture of the photo the moment it is created, and the sharp thumbnail
   replaces it as soon as it has loaded (an instant swap: this site has no animations).
   Two sources, neither needs an extra network request:
   - Unsplash photos: the `blur_hash` string the server forwards. decodeBlurHash() turns it into pixels
     on a 32 px canvas, which becomes a data: URL (img-src allows data:, so the strict CSP is untouched).
   - Uploaded wallpapers: `lqip`, a ~100-400 byte base64 WebP that the server made at upload time. */

const BLURHASH_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';
const BLURHASH_RE = /^[0-9A-Za-z#$%*+,\-.:;=?@[\]^_{|}~]{6,100}$/;          // same rule as the server
const LQIP_RE = /^data:image\/webp;base64,[A-Za-z0-9+/]{16,4000}={0,2}$/;      // only our own tiny WebP is ever used
const BLURHASH_WIDTH = 32;
const lqipCache = new Map();           // "hash|height" -> data URL (re-used when a photo shows up again)

function decode83(str) {
    let value = 0;
    for (const ch of str) {
        const digit = BLURHASH_CHARS.indexOf(ch);
        if (digit < 0) throw new Error('Invalid BlurHash character');
        value = value * 83 + digit;
    }
    return value;
}

const srgbToLinear = v => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const linearToSrgb = v => {
    v = Math.max(0, Math.min(1, v));
    return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255);
};
const signedSquare = v => Math.sign(v) * v * v;

// BlurHash string -> RGBA pixels (Uint8ClampedArray, width x height x 4). Throws on malformed input.
function decodeBlurHash(hash, width, height) {
    const sizeFlag = decode83(hash[0]);
    const numY = Math.floor(sizeFlag / 9) + 1;
    const numX = (sizeFlag % 9) + 1;
    if (hash.length !== 4 + 2 * numX * numY) throw new Error('Invalid BlurHash length');

    const maxAC = (decode83(hash[1]) + 1) / 166;
    const colors = [];
    for (let i = 0; i < numX * numY; i++) {
        if (i === 0) {
            const v = decode83(hash.substring(2, 6));
            colors.push([srgbToLinear(v >> 16), srgbToLinear((v >> 8) & 255), srgbToLinear(v & 255)]);
        } else {
            const v = decode83(hash.substring(4 + i * 2, 6 + i * 2));
            colors.push([
                signedSquare((Math.floor(v / 361) - 9) / 9) * maxAC,
                signedSquare(((Math.floor(v / 19) % 19) - 9) / 9) * maxAC,
                signedSquare(((v % 19) - 9) / 9) * maxAC
            ]);
        }
    }

    const cosX = Array.from({ length: width }, (_, x) => Array.from({ length: numX }, (_, i) => Math.cos(Math.PI * x * i / width)));
    const cosY = Array.from({ length: height }, (_, y) => Array.from({ length: numY }, (_, j) => Math.cos(Math.PI * y * j / height)));
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let r = 0, g = 0, b = 0;
            for (let j = 0; j < numY; j++) {
                for (let i = 0; i < numX; i++) {
                    const basis = cosX[x][i] * cosY[y][j];
                    const c = colors[i + j * numX];
                    r += c[0] * basis;
                    g += c[1] * basis;
                    b += c[2] * basis;
                }
            }
            const p = 4 * (x + y * width);
            pixels[p] = linearToSrgb(r);
            pixels[p + 1] = linearToSrgb(g);
            pixels[p + 2] = linearToSrgb(b);
            pixels[p + 3] = 255;
        }
    }
    return pixels;
}

// BlurHash -> data: URL (or '' when anything is wrong, in which case the card just keeps its plain colour).
// The canvas gets the photo's own proportions, so the "cover" crop of the real image and of the placeholder match.
function blurHashToUrl(hash, photoWidth, photoHeight) {
    if (typeof hash !== 'string' || !BLURHASH_RE.test(hash)) return '';
    const h = photoWidth && photoHeight
        ? Math.max(8, Math.min(64, Math.round(BLURHASH_WIDTH * photoHeight / photoWidth)))
        : 20;
    const key = hash + '|' + h;
    if (lqipCache.has(key)) return lqipCache.get(key);

    let url = '';
    try {
        const canvas = document.createElement('canvas');
        canvas.width = BLURHASH_WIDTH;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.putImageData(new ImageData(decodeBlurHash(hash, BLURHASH_WIDTH, h), BLURHASH_WIDTH, h), 0, 0);
            url = canvas.toDataURL('image/png');
        }
        canvas.width = canvas.height = 0;
    } catch { url = ''; }

    if (lqipCache.size > 400) lqipCache.delete(lqipCache.keys().next().value);   // bounded memory
    lqipCache.set(key, url);
    return url;
}

// The placeholder image (a data: URL) for one wallpaper, or '' when it has none.
function placeholderFor(meta) {
    if (typeof meta.lqip === 'string' && LQIP_RE.test(meta.lqip)) return meta.lqip;
    return meta.blurHash ? blurHashToUrl(meta.blurHash, meta.width, meta.height) : '';
}

// Removes the placeholder as soon as the sharp image is decoded and ready to paint (no fade: instant swap).
function revealWhenLoaded(img, placeholder) {
    if (!placeholder) return;
    const done = () => placeholder.remove();
    const reveal = () => {
        if (typeof img.decode === 'function') img.decode().then(done, done);
        else done();
    };
    if (img.complete && img.naturalWidth) reveal();                    // already cached
    else img.addEventListener('load', reveal, { once: true });         // on error the blurred picture simply stays
}

/* ---------- state + orientation ---------- */

const ORIENTATIONS = ['any', 'landscape', 'portrait'];
const ORIENTATION_KEY = 'greenWingsOrientation';

function loadOrientation() {
    try {
        const v = localStorage.getItem(ORIENTATION_KEY);
        return ORIENTATIONS.includes(v) ? v : 'any';
    } catch { return 'any'; }
}

const wallpaperRegistry = new Map();   // imageUrl -> metadata (favorites, smart download)
let currentView = 'home';              // 'home' | 'search' | 'favorites'
let latestRequest = 0;                 // ignores out-of-date responses
let currentQuery = '';
let nextCursor = null;                 // opaque cursor for the next page of results (null = no more)
let loadingMore = false;               // a "next page" request is running (infinite scroll never overlaps them)
let autoPaused = false;                // an automatic load failed / found nothing new: only the button loads more
let sentinelObserver = null;           // IntersectionObserver on #load-sentinel (null = unsupported: button only)
let orientation = loadOrientation();   // 'any' | 'landscape' | 'portrait'
let uploadedWallpapers = [];
let detailPhotoId = null;// Unsplash id of the photo open in the viewer (null = none / not shareable)
let featuredMeta = null;               // Wallpaper of the Day (same meta objects as the grid cards)
let featuredDay = '';                  // UTC date the server said it belongs to
let featuredFailed = false;            // first load failed: the banner stays hidden
const PHOTO_ID_RE = /^[A-Za-z0-9_-]{6,32}$/;   // same rule as the server

function paintOrientation() {
    if (!orientationBar) return;
    orientationBar.querySelectorAll('button[data-orientation]').forEach(b => {
        const on = b.dataset.orientation === orientation;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
    });
}

function storeOrientation() {
    try { localStorage.setItem(ORIENTATION_KEY, orientation); } catch { /* storage unavailable */ }
}

// Tall cards while the Portrait filter is active on search results (see .grid-layout.is-portrait in the CSS).
function paintGridShape() {
    const filterable = currentView === 'search' || currentView === 'home';
    container.classList.toggle('is-portrait', filterable && orientation === 'portrait');
}
// Safety net on top of the &orientation= request parameter: even if the server does not forward it to
// Unsplash, only photos that really are vertical / horizontal are shown. Items without a size are kept.
function matchesOrientation(item) {
    if (orientation === 'any' || !item || !item.width || !item.height) return true;
    return orientation === 'portrait' ? item.height > item.width : item.width > item.height;
}

/* ---------- URL <-> state (?q=forest&o=portrait, ?view=favorites, &photo=ID) ---------- */

// Collapses extra spaces/tabs/newlines, trims, lower-cases and caps the length.
// Used for typed searches AND for ?q= links, so both behave the same.
function cleanSearchTerm(raw) {
    return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH).toLowerCase();
}

// Contact: close the menu and scroll to the form (scrollIntoView avoids a #hash change that would trigger popstate).
$('#menuContact').addEventListener('click', e => {
    e.preventDefault();
    if (uploadDetails) uploadDetails.open = false;
    $('#contact').scrollIntoView({ block: 'start' });
});

// When the menu closes, collapse the upload form inside it so it opens tidy next time.
if (uploadDetails) {
    uploadDetails.addEventListener('toggle', () => {
        const inner = uploadDetails.querySelector('.menu-upload');
        if (!uploadDetails.open && inner) inner.open = false;
    });
}

function readUrlState() {
    const p = new URLSearchParams(location.search);
    const o = p.get('o');
    const photo = p.get('photo');
    return {
        q: cleanSearchTerm(p.get('q')),
        o: ORIENTATIONS.includes(o) ? o : null,
        view: p.get('view'),
        photo: photo && PHOTO_ID_RE.test(photo) ? photo : null
    };
}

function currentUrl() {
    const p = new URLSearchParams();
    if (currentView === 'search' && currentQuery) {
        p.set('q', currentQuery);
        if (orientation !== 'any') p.set('o', orientation);
    } else if (currentView === 'favorites') {
        p.set('view', 'favorites');
    }
    if (detailPhotoId) p.set('photo', detailPhotoId);
    const s = p.toString();
    return location.pathname + (s ? '?' + s : '');
}

// mode: 'push' (new history entry), 'replace' (same entry) or null (URL already correct, e.g. back button)
function syncUrl(mode) {
    if (!mode) return;
    const url = currentUrl();
    if (url === location.pathname + location.search) return;
    history[mode === 'push' ? 'pushState' : 'replaceState']({}, '', url);
}

// True when the URL describes the view that is already on screen (only the photo viewer changed).
// This stops Back / Forward from re-rendering the grid (which would reshuffle the home mix and lose the scroll position).
function sameView({ q, o, view }) {
    const target = q ? 'search' : view === 'favorites' ? 'favorites' : 'home';
    if (target !== currentView) return false;
    return target !== 'search' || (q === currentQuery && (!o || o === orientation));
}

function applyUrlState(initial = false) {
    const state = readUrlState();
    const { q, o, view, photo } = state;

    // After a reload, history.state survives; forget it so "Close" takes the direct-link path.
    if (initial && history.state && history.state.lb) history.replaceState(null, '', location.href);

    if (initial || !sameView(state)) {
        if (o) { orientation = o; paintOrientation(); }
        if (q) {
            searchInput.value = q;
            fetchWallpapers(q, { historyMode: null });
        } else if (view === 'favorites') {
            showFavoritesPage(null);
        } else if (!initial) {
            showHome(null);
        }
    }
    syncDetailFromUrl(photo);
}

window.addEventListener('popstate', () => applyUrlState());

$('#logo-link').addEventListener('click', e => {
    // Let "open in new tab" shortcuts and middle-clicks use the real link.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (uploadDetails) uploadDetails.open = false;
    showHome();
});

/* ---------- views ---------- */
const HOME_COUNT = 12;
const HOME_ORIENTATION = 'landscape';   // 'portrait' if you'd rather lead with phone wallpapers

// Swaps the 3 static cards for a random mix. If anything fails, the static cards simply stay.
async function loadHomeMix({ showLoading = false } = {}) {
    const requestId = ++latestRequest;
    if (showLoading) showMessage(t('loading'), null, 'loading');

    let results = [];
    try {
        let url = `/api/random?count=${HOME_COUNT}`;
        if (orientation !== 'any') url += `&orientation=${orientation}`;
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            results = (Array.isArray(data.results) ? data.results : []).filter(matchesOrientation);
        }
    } catch (error) {
        console.error('Random mix failed:', error);
    }

    if (requestId !== latestRequest || currentView !== 'home') return;   // a newer action took over

    if (results.length) {
        displayWallpapers(results);
        renderUploaded();
    } else if (showLoading) {                  // failed after we cleared the grid: bring the static cards back
        container.innerHTML = HOME_HTML;
        applyI18n(container);
        initStaticCards();
        renderUploaded();
        updateFavoriteButtons();
    }
}

// Section heading + browser tab title for the current view, in the current language.
function paintTitles() {
    let title = t('section_latest');
    let docTitle = t('doc_title');

    if (currentView === 'search') {
        const key = QUERY_LABELS[currentQuery];
        const shown = lang === 'ar' && key ? t(key) : currentQuery;
        title = t('results_for', { q: '\u2068' + shown + '\u2069' });   // isolates keep Latin keywords tidy in RTL
        docTitle = `${shown} – ${t('doc_title')}`;
    } else if (currentView === 'favorites') {
        title = t('section_favorites');
        docTitle = `${t('nav_favorites')} – ${t('doc_title')}`;
    }

    sectionTitle.textContent = title;
    document.title = docTitle;
}

function setView(view, navKey) {
    currentView = view;
    paintTitles();
    paintGridShape();
    hero.style.display = view === 'home' ? '' : 'none';
    if (orientationBar) orientationBar.hidden = view !== 'search' && view !== 'home';
    if (categoryBar) categoryBar.hidden = view !== 'search' && view !== 'home';   // pills: home + results only
    paintCategories();                                 // highlight the pill that matches this view / query
    if (filterBar) filterBar.hidden = view !== 'search' && view !== 'home';       // pills + color swatches: home + results only
    paintColors();                                     // highlight the active color swatch
    applyColorFilter();                                // re-evaluate for the new view (the color filter is ignored on Favorites)
    syncFeaturedVisibility();                          // NEW: the banner belongs to the home view only
    if (view !== 'search') {               // leaving the results: forget the cursor and stop watching the sentinel
        nextCursor = null;
        loadMoreBtn.hidden = true;
        watchSentinel();
    }

    document.querySelectorAll('.nav-links a').forEach(a => {
        const on = a.dataset.nav === navKey;
        a.classList.toggle('active', on);
        if (on) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
    });
}

function showHome(historyMode = 'push') {
    latestRequest++;                   // cancel any search still in flight
    searchInput.value = '';            // Home = no active search, so the box is cleared
    container.innerHTML = HOME_HTML;   // static, trusted markup (English source text)
    applyI18n(container);              // ...translated to the current language
    initStaticCards();
    setView('home', 'home');
    syncUrl(historyMode);
    renderUploaded();
    updateFavoriteButtons();
    window.scrollTo({ top: 0 });
    loadHomeMix();
}

function showFavoritesPage(historyMode = 'push') {
    latestRequest++;                   // cancel any search still in flight
    setView('favorites', 'favorites');
    syncUrl(historyMode);
    displayWallpapers(favorites, { heading: 'empty_fav_h', text: 'empty_fav_t' });
}

/* ---------- messages / errors ----------
   Colours come from CSS variables (var(--text), var(--error)) so these messages stay readable
   in BOTH themes and follow a theme switch automatically.
   `key` (optional) is a translation key: the message then carries data-i18n, so it is
   re-translated if the language is switched while it is on screen. */

function showMessage(text, color, key) {
    container.innerHTML = '';
    const p = document.createElement('p');
    p.style.cssText = `text-align:center;color:${color || 'var(--text)'};width:100%;grid-column:1/-1;`;
    if (key) p.dataset.i18n = key;
    p.textContent = text;
    container.appendChild(p);
}

function showError(message, retry, key) {
    showMessage(message, 'var(--error)', key);
    if (retry) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'retry-btn';
        btn.dataset.i18n = 'try_again';
        btn.textContent = t('try_again');
        btn.addEventListener('click', retry);
        container.appendChild(btn);
    }
}

/* ---------- Unsplash search (via our own backend) ----------
   Cursor pagination + infinite scroll:
   - the first request has no cursor; every response carries `next_cursor` (null on the last page),
     which is sent back unchanged as ?cursor= to get the page that follows;
   - an IntersectionObserver watches the invisible #load-sentinel under the grid and asks for the next page
     shortly before it scrolls into view;
   - the "Load more" button stays as the fallback: it is the only loader when IntersectionObserver is missing,
     and it comes back as a "retry" when an automatic load failed. While a page is loading it doubles as
     the "Loading..." indicator. */

const AUTO_LOAD = 'IntersectionObserver' in window;

// The button is only visible when infinite scroll cannot (or may not) do the job on its own.
function syncLoadMore() {
    const more = currentView === 'search' && !!nextCursor;
    loadMoreBtn.hidden = !more || (AUTO_LOAD && !autoPaused);
}

// (Re)starts watching the sentinel. Re-observing makes the browser report the CURRENT state again, so a sentinel
// that is still near the viewport after a page was added (tall screens, few results) triggers the next load.
function watchSentinel() {
    if (!sentinelObserver || !loadSentinel) return;
    sentinelObserver.unobserve(loadSentinel);
    if (currentView === 'search' && nextCursor) sentinelObserver.observe(loadSentinel);
}

function maybeLoadMore() {
    if (currentView !== 'search' || !nextCursor || loadingMore || autoPaused) return;
    fetchWallpapers(currentQuery, { append: true });
}

async function fetchWallpapers(query, { append = false, historyMode = 'push', emptyRuns = 0 } = {}) {
    if (append && (!nextCursor || loadingMore)) return;      // nothing left to load, or a page is already on its way
    const requestId = ++latestRequest;
    const cleanQuery = cleanSearchTerm(query) || 'nature';
    let retry = false;

    if (append) {
        loadingMore = true;
        loadMoreBtn.hidden = false;                           // doubles as the "Loading..." indicator
        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = t('loading');
    } else {
        currentQuery = cleanQuery;
        nextCursor = null;
        autoPaused = false;
        setView('search', cleanQuery);
        syncUrl(historyMode);
        showMessage(t('loading'), null, 'loading');
    }

    try {
        let url = `/api/photos?query=${encodeURIComponent(cleanQuery)}`;
        if (append) url += `&cursor=${encodeURIComponent(nextCursor)}`;
        if (orientation !== 'any') url += `&orientation=${orientation}`;

        const response = await fetch(url);
        if (requestId !== latestRequest) return;
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const detail = typeof err.detail === 'string' ? err.detail : '';
            const message = detail || (append ? t('err_more') : t('err_server'));
            if (append) {
                autoPaused = true;                            // the button comes back as "retry"
                showToast(message, true);
            } else {
                showError(message, () => fetchWallpapers(cleanQuery, { historyMode: null }), detail ? '' : 'err_server');
            }
            return;
        }

        const data = await response.json();
        if (requestId !== latestRequest) return;

        nextCursor = typeof data.next_cursor === 'string' && data.next_cursor ? data.next_cursor : null;
        const received = Array.isArray(data.results) ? data.results : [];
        const results = received.filter(matchesOrientation);

        if (!append && received.length > 0 && results.length === 0 && nextCursor && emptyRuns < MAX_EMPTY_RUNS) {
            // Photos came back, but none has the chosen orientation: quietly look at the next page
            // (the "Loading..." message stays on screen meanwhile).
            loadMoreBtn.hidden = true;
            retry = true;
        } else {
            const added = displayWallpapers(results, undefined, append);
            if (added > 0) autoPaused = false;

            // Everything on this page was already shown (or filtered out): quietly fetch the next one.
            if (append && added === 0) {
                if (nextCursor && emptyRuns < MAX_EMPTY_RUNS) {
                    retry = true;
                } else {
                    autoPaused = !!nextCursor;                // gave up: stop auto-loading, the button can continue
                    showToast(t(activeColor() ? 'color_no_more' : 'no_more'));
                }
            }
        }
    } catch (error) {
        console.error('Error:', error);
        if (requestId === latestRequest) {
            if (append) {
                autoPaused = true;
                showToast(t('err_more'), true);
            } else {
                showError(t('err_generic'), () => fetchWallpapers(cleanQuery, { historyMode: null }), 'err_generic');
            }
        }
    } finally {
        if (append) loadingMore = false;
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = t('load_more');
        if (!retry) {
            syncLoadMore();
            watchSentinel();
            refreshColorEmpty();
        }
    }

    // Runs after `finally` so the retry's "Loading..." state isn't overwritten.
    if (retry) fetchWallpapers(cleanQuery, { append: true, emptyRuns: emptyRuns + 1 });
}

loadMoreBtn.addEventListener('click', () => {
    autoPaused = false;
    if (nextCursor) fetchWallpapers(currentQuery, { append: true });
});

if (AUTO_LOAD && loadSentinel) {
    // 600px of head start: the next page is usually there before the person reaches the bottom.
    sentinelObserver = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) maybeLoadMore();
    }, { rootMargin: '0px 0px 600px 0px' });
}

/* ---------- orientation filter ---------- */

if (orientationBar) {
    orientationBar.addEventListener('click', e => {
        const btn = e.target.closest('button[data-orientation]');
        if (!btn || btn.dataset.orientation === orientation) return;
        orientation = btn.dataset.orientation;
        storeOrientation();
        paintOrientation();
        if (currentView === 'search') {
            fetchWallpapers(currentQuery, { historyMode: 'replace' });
        } else if (currentView === 'home') {
            paintGridShape();
            loadHomeMix({ showLoading: true });
        }
    });
}

/* ---------- quick filter pills ----------
   The pills are static buttons in index.html (data-category = English search keyword, "" = All).
   A tap runs the SAME search as the header links (runSearch -> fetchWallpapers -> /api/photos), so orientation,
   infinite scroll, the ?q= URL, Back / Forward and the Arabic heading all work with no new code paths.
   The active pill is derived from the current view in setView(), so it also follows the header links,
   typed searches, ?q= links and the browser's Back button. */

// Highlights the pill that matches the screen: home = "All", results = the pill whose keyword equals the query
// (a custom search highlights none), favorites = none (the bar is hidden there anyway).
function paintCategories() {
    if (!categoryBar) return;
    const active = currentView === 'home' ? '' : currentView === 'search' ? currentQuery : null;
    let activePill = null;
    categoryBar.querySelectorAll('button[data-category]').forEach(b => {
        const on = b.dataset.category === active;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
        if (on) activePill = b;
    });
    if (activePill) centerPill(activePill);
}

// Scrolls ONLY the pills row (never the page) so the active pill sits in the middle.
// scrollLeft grows to the right in LTR and RTL alike, so one formula serves both; the browser clamps the ends.
function centerPill(pill) {
    const barBox = categoryBar.getBoundingClientRect();
    if (!barBox.width) return;                         // bar is hidden: nothing to scroll
    const pillBox = pill.getBoundingClientRect();
    categoryBar.scrollLeft += (pillBox.left + pillBox.width / 2) - (barBox.left + barBox.width / 2);
}

if (categoryBar) {
    categoryBar.addEventListener('click', e => {
        const pill = e.target.closest('button[data-category]');
        if (!pill) return;
        const category = pill.dataset.category;
        if (!category) {                               // "All" = the normal home view
            if (currentView !== 'home') showHome();
            return;
        }
        if (currentView === 'search' && currentQuery === category) return;   // already showing it
        runSearch(category);
    });
}

/* ---------- dominant color filter ----------
   Each wallpaper falls into ONE bucket: green | black | white | blue | orange | purple | neutral.
   - Unsplash photos already carry meta.color (a hex): classified with plain arithmetic, no image work at all.
   - Photos without it (uploads, the 3 static cards): ONE 16x16 canvas sample of the tiny lqip (data: URL) or the
     same-origin thumbnail. Cross-origin images are never drawn (tainted canvas), so they are never sampled.
   - Results are cached per photo in memory (colorCache) and sampled ones also in sessionStorage, so every image
     is analysed at most once per session.
   - Filtering only toggles `hidden` on cards that are already in the grid: no refetch, no re-render. Hidden cards
     are display:none, so their lazy images are not downloaded. New pages are filtered as they arrive, and
     displayWallpapers() returns how many NEW cards are visible, so the existing "empty page" retry logic in
     fetchWallpapers (MAX_EMPTY_RUNS) also bounds how far a rare color keeps loading pages on its own.
   The active swatch is not persisted: every visit starts on "All colors". */

const COLOR_BUCKETS = ['green', 'black', 'white', 'blue', 'orange', 'purple', 'neutral'];
const COLOR_STORE_KEY = 'greenWingsColors';
const COLOR_STORE_MAX = 300;
const colorCache = new Map();          // photoKey -> bucket ('' = could not be determined)
const colorStore = {};                 // sampled results only (mirrored to sessionStorage)
const colorPending = new Set();        // photoKeys being sampled right now
let colorFilter = '';                  // '' = all colors
let colorPaintQueued = false;

try {
    Object.entries(JSON.parse(sessionStorage.getItem(COLOR_STORE_KEY)) || {}).forEach(([k, v]) => {
        if (COLOR_BUCKETS.includes(v)) { colorStore[k] = v; colorCache.set(k, v); }
    });
} catch { /* storage unavailable: sampling simply runs again */ }

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    return [h < 0 ? h + 360 : h, s, l];
}

// The thresholds below are the only "tuning knobs": adjust them if a bucket feels too greedy.
function bucketFromRgb(r, g, b) {
    const [h, s, l] = rgbToHsl(r, g, b);
    if (l < 0.07 || (l < 0.17 && s < 0.22)) return 'black';
    if (l > 0.90 || (l > 0.78 && s < 0.25)) return 'white';
    if (s < 0.14) return 'neutral';                          // greys
    if (h >= 75 && h < 170) return 'green';
    if (h >= 170 && h < 255) return 'blue';                  // teal / cyan / blue
    if (h >= 255 && h < 335) return 'purple';                // violet / magenta
    return s >= 0.45 && l >= 0.30 ? 'orange' : 'neutral';    // warm hues: vivid = orange, muted / brown = earth
}

function storeColor(key, bucket) {
    colorStore[key] = bucket;
    const keys = Object.keys(colorStore);
    if (keys.length > COLOR_STORE_MAX) delete colorStore[keys[0]];   // oldest out
    try { sessionStorage.setItem(COLOR_STORE_KEY, JSON.stringify(colorStore)); } catch { /* ignore */ }
}

// Most common bucket among the pixels of a 16x16 thumbnail. Throws if the canvas is tainted.
function dominantBucket(img) {
    const S = 16;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    try {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return '';
        ctx.drawImage(img, 0, 0, S, S);
        const px = ctx.getImageData(0, 0, S, S).data;
        const votes = new Map();
        let best = '', top = 0;
        for (let i = 0; i < px.length; i += 4) {
            if (px[i + 3] < 128) continue;
            const b = bucketFromRgb(px[i], px[i + 1], px[i + 2]);
            const n = (votes.get(b) || 0) + 1;
            votes.set(b, n);
            if (n > top) { top = n; best = b; }
        }
        return best;
    } finally {
        canvas.width = canvas.height = 0;
    }
}

// Where to sample from: the base64 lqip (no network) or a same-origin thumbnail. '' = not possible.
function detectSource(meta) {
    if (typeof meta.lqip === 'string' && LQIP_RE.test(meta.lqip)) return meta.lqip;
    const src = meta.thumbUrl || meta.imageUrl;
    try { return new URL(src, location.href).origin === location.origin ? src : ''; } catch { return ''; }
}

function queueColorFilter() {          // coalesces several finished samples into one pass
    if (colorPaintQueued) return;
    colorPaintQueued = true;
    requestAnimationFrame(() => { colorPaintQueued = false; applyColorFilter(); });
}

function detectColor(key, meta) {
    if (colorPending.has(key)) return;
    const src = detectSource(meta);
    if (!src) { colorCache.set(key, ''); return; }
    colorPending.add(key);
    const finish = bucket => {
        colorPending.delete(key);
        colorCache.set(key, bucket);
        if (bucket) storeColor(key, bucket);
        queueColorFilter();
    };
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
        let bucket = '';
        try { bucket = dominantBucket(img); } catch { /* no canvas / tainted */ }
        finish(bucket);
    };
    img.onerror = () => finish('');
    img.src = src;
}

// Bucket for one wallpaper, or undefined while a sample is still running.
function colorBucket(meta) {
    const key = photoKey(meta.imageUrl);
    if (colorCache.has(key)) return colorCache.get(key) || undefined;
    if (/^#[0-9a-f]{6}$/i.test(meta.color || '')) {
        const n = parseInt(meta.color.slice(1), 16);
        const bucket = bucketFromRgb(n >> 16, (n >> 8) & 255, n & 255);
        colorCache.set(key, bucket);
        return bucket;
    }
    detectColor(key, meta);
    return undefined;
}

// The filter only applies to Home and Results (the swatches are hidden on Favorites).
const activeColor = () => (currentView === 'home' || currentView === 'search' ? colorFilter : '');

function refreshColorEmpty() {
    if (!colorEmpty) return;
    const total = container.querySelectorAll('.card').length;
    const shown = container.querySelectorAll('.card:not([hidden])').length;
    colorEmpty.hidden = !(activeColor() && total > 0 && shown === 0 && !loadingMore && (!nextCursor || autoPaused));
}

// Shows / hides the cards already in the grid. `fresh` (optional) = metas just added: returns how many of
// them are visible, which is what fetchWallpapers uses to decide whether a page was "empty".
function applyColorFilter(fresh) {
    const active = activeColor();
    container.querySelectorAll('.card').forEach(card => {
        if (!active) { card.hidden = false; return; }
        const meta = wallpaperRegistry.get(card.dataset.key);
        card.hidden = !(meta && colorBucket(meta) === active);
    });
    refreshColorEmpty();
    if (!fresh) return 0;
    if (!active) return fresh.length;
    return fresh.filter(m => colorCache.get(photoKey(m.imageUrl)) === active).length;
}

function paintColors() {
    if (!colorBar) return;
    colorBar.querySelectorAll('button[data-color]').forEach(b => {
        b.setAttribute('aria-pressed', String(b.dataset.color === colorFilter));
    });
}

function setColorFilter(next) {
    const value = COLOR_BUCKETS.includes(next) && next !== colorFilter ? next : '';   // tapping the active swatch = All colors
    if (value === colorFilter) return;
    colorFilter = value;
    paintColors();
    applyColorFilter();
    autoPaused = false;                                // a new color gets a fresh chance to auto-load
    syncLoadMore();
    watchSentinel();                                   // sentinel still in view (everything hidden)? load the next page
}

if (colorBar) {
    colorBar.addEventListener('click', e => {
        const sw = e.target.closest('button[data-color]');
        if (sw) setColorFilter(sw.dataset.color);
    });
}

/* ---------- resolution badge ---------- */

function getQualityLabel(w, h) {
    const longEdge = Math.max(w, h);
    if (longEdge >= 3840) return { text: '4K UHD' };
    if (longEdge >= 2560) return { text: '2K QHD' };
    if (longEdge >= 1920) return { text: 'FULL HD' };
    if (longEdge >= 1280) return { text: 'HD', subtle: true };
    return { text: 'SD', subtle: true };
}

// knownW/knownH = real original size (from the API). Cards load resized thumbnails, so measuring
// the loaded image would always say "HD". Without known sizes, full-size images are measured instead.
function attachQualityBadge(card, knownW, knownH) {
    const apply = (w, h) => {
        if (!w || !h || card.querySelector('.quality-badge')) return;
        const { text, subtle } = getQualityLabel(w, h);
        const badge = document.createElement('span');
        badge.className = 'quality-badge' + (subtle ? ' hd-subtle' : '');
        badge.textContent = text;
        card.appendChild(badge);
    };

    if (knownW && knownH) { apply(knownW, knownH); return; }

    const imgEl = card.querySelector('img');
    if (!imgEl || card.dataset.thumb) return;
    if (imgEl.complete) apply(imgEl.naturalWidth, imgEl.naturalHeight);
    else imgEl.addEventListener('load', () => apply(imgEl.naturalWidth, imgEl.naturalHeight), { once: true });
}

/* ---------- rendering (XSS-safe: no innerHTML with dynamic data) ---------- */

const ICON_NS = 'http://www.w3.org/2000/svg';
const ICONS = {   // Lucide, 24x24 grid (ISC license)
    heart: [['path', { d: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z' }]],
    leaf: [
        ['path', { d: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z' }],
        ['path', { d: 'M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12' }]
    ],
    link: [
        ['path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }],
        ['path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }]
    ],
    star: [['polygon', { points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' }]],
};

// Same XSS-safe approach as downloadIcon(): DOM methods only, never innerHTML.
function makeIcon(name) {
    const svg = document.createElementNS(ICON_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    (ICONS[name] || []).forEach(([tag, attrs]) => {
        const el = document.createElementNS(ICON_NS, tag);
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        svg.appendChild(el);
    });
    return svg;
}

function downloadIcon() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    [
        ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
        ['polyline', { points: '7 10 12 15 17 10' }],
        ['line', { x1: 12, y1: 15, x2: 12, y2: 3 }]
    ].forEach(([tag, attrs]) => {
        const el = document.createElementNS(NS, tag);
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        svg.appendChild(el);
    });
    return svg;
}

// labelKey (+ optional vars) instead of a fixed string, so the label follows the language switcher.
function makeDownloadButton({ labelKey, vars, url, mode, key, photoId, secondary }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'download-btn' + (secondary ? ' secondary' : '');
    if (url) btn.dataset.downloadUrl = url;
    if (mode) btn.dataset.mode = mode;
    if (key) btn.dataset.key = key;
    if (photoId) btn.dataset.photoId = photoId;
    const text = document.createElement('span');
    text.className = 'btn-label';
    text.dataset.i18n = labelKey;
    if (vars) text.dataset.i18nVars = JSON.stringify(vars);
    text.textContent = t(labelKey, vars);
    btn.append(downloadIcon(), text);
    return btn;
}

function makeLink(text, href) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.dir = 'auto';                    // Latin names stay tidy inside Arabic sentences
    return a;
}

// "Photo by <name> on Unsplash" with links (required by the Unsplash API guidelines).
// The sentence template comes from the translations, so the word order can differ per language.
// Author data lives on the element (already validated by unsplashLink) so it can be re-filled on language change.
// The full sentence is also set as a hover tooltip (title), because long author names get clamped to two lines.
function fillAttribution(p) {
    p.replaceChildren();
    t('photo_by').split(/(\{name\}|\{site\})/).forEach(part => {
        if (part === '{name}') p.append(makeLink(p.dataset.authorName, p.dataset.authorHref));
        else if (part === '{site}') p.append(makeLink('Unsplash', unsplashLink('https://unsplash.com')));
        else if (part) p.append(part);
    });
    p.title = p.textContent;
}

function buildSubtitle(meta) {
    const p = document.createElement('p');
    const authorHref = meta.authorName && meta.authorUrl ? unsplashLink(meta.authorUrl) : null;
    if (authorHref) {
        p.className = 'attribution';
        p.dataset.authorName = meta.authorName;
        p.dataset.authorHref = authorHref;
        fillAttribution(p);
    } else {
        p.textContent = meta.subtitle || '';
        if (meta.subtitle) p.title = meta.subtitle;       // full text on hover
    }
    return p;
}

function buildWallpaperCard(meta) {
    const { imageUrl, title } = meta;
    wallpaperRegistry.set(imageUrl, meta);

    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.key = imageUrl;
    if (meta.thumbUrl && meta.thumbUrl !== imageUrl) card.dataset.thumb = '1';

    const img = document.createElement('img');
    img.className = 'main-card-img';
    img.loading = 'lazy';
    img.decoding = 'async';
    if (meta.thumbSrcset) {
        img.sizes = THUMB_SIZES;
        img.srcset = meta.thumbSrcset;
    }
    img.src = meta.thumbUrl || imageUrl;
    img.alt = title;

    // Blur-up: .card-media holds the photo's own colour, a blurred placeholder underneath, and the sharp image on top.
    // (Style values are set through the DOM, never through markup, so the strict style-src CSP is untouched.)
    const media = document.createElement('div');
    media.className = 'card-media';
    if (/^#[0-9a-f]{3,8}$/i.test(meta.color || '')) media.style.backgroundColor = meta.color;

    const placeholderUrl = placeholderFor(meta);
    let placeholder = null;
    if (placeholderUrl) {
        placeholder = document.createElement('div');
        placeholder.className = 'card-lqip';
        placeholder.setAttribute('aria-hidden', 'true');
        placeholder.style.backgroundImage = `url("${placeholderUrl}")`;
        media.append(placeholder);
    }
    media.append(img);
    revealWhenLoaded(img, placeholder);

    const open = document.createElement('button');       // invisible, stretched over the whole card
    open.type = 'button';
    open.className = 'card-open';
    open.setAttribute('aria-label', title);
    open.title = title;                                   // full title on hover

    const favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.className = 'favorite-btn';
    favBtn.setAttribute('data-src', imageUrl);
    favBtn.setAttribute('aria-label', t('fav_add'));
    favBtn.setAttribute('aria-pressed', 'false');
    favBtn.append(makeIcon('heart'));

    const info = document.createElement('div');
    info.className = 'card-info';
    const h3 = document.createElement('h3');
    h3.textContent = title;
    info.append(h3, buildSubtitle(meta));

    card.append(media, open, favBtn, info);
    return card;
}

const capitalize = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Accepts: a URL string (legacy favorites), an Unsplash result from /api/photos, or a stored meta object.
function normalizeItem(item) {
    if (typeof item === 'string') {
        return { imageUrl: item, thumbUrl: sizedUrl(item, { w: THUMB_WIDTH, q: 75 }), title: t('wp_default'), subtitle: t('sub_favorite'), downloadUrl: item };
    }
    if (item && item.urls) {
        const raw = item.urls.raw || '';
        const regular = item.urls.regular || raw;
        if (!regular) return null;
        return {
            imageUrl: regular,
            thumbUrl: raw ? sizedUrl(raw, { w: THUMB_WIDTH, q: THUMB_Q, fm: 'webp', fit: 'max' }) : regular,
            thumbSrcset: raw ? thumbSrcset(raw) : '',
            fullUrl: raw ? sizedUrl(raw, { w: lightboxWidth(), q: 80, fm: 'jpg', fit: 'max' }) : regular,
            rawUrl: raw,
            downloadUrl: raw || regular,
            photoId: item.id,
            title: capitalize(item.description) || t('wp_default'),
            authorName: item.user?.name,
            authorUrl: item.user?.url,
            subtitle: t('by_name', { name: item.user?.name || t('unknown') }),
            width: item.width,
            height: item.height,
            color: item.color,
            blurHash: typeof item.blur_hash === 'string' ? item.blur_hash : ''
        };
    }
    if (item && item.imageUrl) {
        return {
            downloadUrl: item.imageUrl,
            title: t('wp_default'),
            subtitle: t('sub_favorite'),
            ...item,
            thumbUrl: item.thumbUrl || sizedUrl(item.imageUrl, { w: THUMB_WIDTH, q: 75 })
        };
    }
    return null;
}

function uploadMeta(w) {
    return {
        imageUrl: w.image_url,
        thumbUrl: w.thumb_url || w.image_url,     // server-made 800px WebP
        lqip: typeof w.lqip === 'string' ? w.lqip : '',   // server-made tiny base64 WebP (blur-up placeholder)
        title: w.title || t('wp_untitled'),
        subtitle: w.description || t('sub_uploaded'),
        downloadUrl: w.image_url,
        width: w.width || undefined,
        height: w.height || undefined
    };
}

// headingKey / textKey are translation keys (the elements carry data-i18n, so they follow the language switcher).
// Colours use CSS variables so the empty state is readable in both themes.
function buildEmptyState(headingKey, textKey) {
    const box = document.createElement('div');
    box.style.cssText = 'text-align:center;width:100%;padding:60px 20px;color:var(--text-soft);grid-column:1/-1;';

    const icon = document.createElement('div');
    icon.className = 'empty-icon';
    icon.appendChild(makeIcon('leaf'));

    const h = document.createElement('h3');
    h.style.cssText = 'color:var(--heading);margin-bottom:8px;font-size:1.2rem;';
    h.dataset.i18n = headingKey;
    h.textContent = t(headingKey);

    const desc = document.createElement('p');
    desc.style.cssText = 'color:var(--text-soft);max-width:400px;margin:0 auto;font-size:0.95rem;';
    desc.dataset.i18n = textKey;
    desc.textContent = t(textKey);

    box.append(icon, h, desc);
    return box;
}
// "No results" state for searches. The <p> carries data-i18n, so applyLanguage() re-translates it
// automatically if the visitor switches EN <-> AR while it is on screen.
function buildNoResults() {
    const NS = 'http://www.w3.org/2000/svg';
    const box = document.createElement('div');
    box.className = 'no-results';

    const icon = document.createElement('div');
    icon.className = 'no-results-icon';
    icon.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', '11');
    circle.setAttribute('cy', '11');
    circle.setAttribute('r', '7');
    const handle = document.createElementNS(NS, 'line');
    handle.setAttribute('x1', '21');
    handle.setAttribute('y1', '21');
    handle.setAttribute('x2', '16.65');
    handle.setAttribute('y2', '16.65');
    svg.append(circle, handle);
    icon.appendChild(svg);

    const msg = document.createElement('p');
    msg.dataset.i18n = 'no_results';
    msg.textContent = t('no_results');

    const chips = document.createElement('div');
    chips.className = 'no-results-chips';
    ['forest', 'mountains', 'ocean', 'sunset'].forEach(k => {     // stay English: they are Unsplash keywords
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = k;
        b.addEventListener('click', () => runSearch(k));
        chips.appendChild(b);
    });

    box.append(icon, msg, chips);
    return box;
}
const hasCard = key => !!container.querySelector(`.card[data-key="${CSS.escape(key)}"]`);


// Returns how many NEW cards were added (0 when everything was a duplicate or empty).
function displayWallpapers(items, empty, append = false) {
    // "Append" onto a grid that holds no cards yet (e.g. only a loading message) behaves like a fresh render.
    const fresh = !append || !container.querySelector('.card');

    // Fresh render: always wipe old cards, old errors, and the "Loading..." text.
    if (fresh) container.innerHTML = '';

    // Stable keys of everything already shown + everything accepted from this batch:
    // a photo can never be rendered twice, even if it comes back with a different URL.
    const seen = new Set();
    if (!fresh) {
        container.querySelectorAll('.card').forEach(card => {
            if (card.dataset.key) seen.add(photoKey(card.dataset.key));
        });
    }

    const metas = (items || [])
        .map(normalizeItem)
        .filter(Boolean)
        .filter(m => {
            const key = photoKey(m.imageUrl);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

    // Fresh render with nothing to show: the container is already empty, so show ONLY the message and stop.
    // `empty` is only passed for Favorites; a search with 0 results gets the "no results" message.
    if (fresh && metas.length === 0) {
        container.appendChild(empty ? buildEmptyState(empty.heading, empty.text) : buildNoResults());
        return 0;   // nothing renders underneath the message
    }

    // Build off-DOM, insert once: a single layout pass instead of one per card.
    const fragment = document.createDocumentFragment();
    metas.forEach(meta => {
        const card = buildWallpaperCard(meta);
        attachQualityBadge(card, meta.width, meta.height);
        fragment.appendChild(card);
    });
    container.appendChild(fragment);
    updateFavoriteButtons();
    return applyColorFilter(metas);   // hides non-matching cards; returns how many NEW cards are visible
}

function prependWallpaperCard(wallpaper) {
    if (!wallpaper || !wallpaper.image_url || hasCard(wallpaper.image_url)) return;
    const meta = uploadMeta(wallpaper);
    if (!matchesOrientation(meta)) return;
    const card = buildWallpaperCard(meta);
    attachQualityBadge(card, meta.width, meta.height);
    container.prepend(card);
    updateFavoriteButtons();
}

function initStaticCards() {
    container.querySelectorAll('.card').forEach(card => {
        const img = card.querySelector('img');
        const dl = card.querySelector('.download-btn');
        if (img) {
            const src = img.getAttribute('src');
            card.dataset.key = src;
            wallpaperRegistry.set(src, {
                imageUrl: src,
                thumbUrl: src,
                title: card.querySelector('h3')?.textContent || t('wp_default'),
                subtitle: card.querySelector('p')?.textContent || '',
                downloadUrl: dl?.getAttribute('data-download-url') || src

            });
        }
        attachQualityBadge(card);
    });
}

/* Approved uploads: GET /api/wallpapers -> [{image_url, thumb_url, lqip, width, height, title, description}] newest first */
function renderUploaded() {
    if (currentView !== 'home') return;
    [...uploadedWallpapers].reverse().forEach(prependWallpaperCard);
    applyColorFilter();
}

async function loadUploadedWallpapers() {
    try {
        const response = await fetch('/api/wallpapers');
        if (!response.ok) return;
        const list = await response.json();
        if (Array.isArray(list)) {
            uploadedWallpapers = list;
            renderUploaded();
        }
    } catch { /* endpoint not available: ignore */ }
}

/* ---------- download handling ---------- */

const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

// Unsplash API guidelines: report every download (the server holds the API key).
function trackDownload(photoId) {
    if (!photoId) return;
    fetch(`/api/photos/${encodeURIComponent(photoId)}/download`, { method: 'POST', keepalive: true }).catch(() => {});
}

document.addEventListener('click', async function (e) {
    const button = e.target.closest('.download-btn');
    if (!button) return;
    e.preventDefault();
    if (button.dataset.action === 'share') { shareDetail(); return; }   // "Copy link" reuses the button style
    if (button.disabled) return;

    let imageUrl = button.getAttribute('data-download-url');
    let sizeTag = '';
    let screenJob = null;                          // set for "Download for my screen"
    if (button.dataset.mode === 'screen') {
        const meta = wallpaperRegistry.get(button.dataset.key);
        if (meta && meta.rawUrl) {
            const size = smartSize(meta);          // recalculated now (the device may have been rotated)
            imageUrl = smartUrl(meta, size);       // fallback URL (server-side crop)
            sizeTag = `-${size.w}x${size.h}`;
            screenJob = { meta, size };
        }
    }
    if (!imageUrl) return;

    const photoId = button.dataset.photoId;
    const label = button.querySelector('.btn-label') || button;
    const originalText = label.textContent;
    label.textContent = t('downloading');
    button.disabled = true;

    try {
        let blob = null;

        // Preferred: aspect-ratio-safe crop done in the browser (never stretches the photo).
        if (screenJob) {
            try {
                blob = await buildScreenBlob(screenJob.meta, screenJob.size);
            } catch (cropError) {
                console.warn('In-browser crop failed, using the server-side crop instead:', cropError);
            }
        }

        // Normal downloads, and the fallback for the screen download.
        if (!blob) {
            const response = await fetch(imageUrl);
            if (!response.ok) throw new Error('Network response was not ok');
            blob = await response.blob();
        }

        const ext = EXTENSIONS[blob.type] || 'jpg';
        const blobUrl = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `green-wings-${photoId || Date.now()}${sizeTag}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);

        trackDownload(photoId);
        showToast(t('dl_ok'));
    } catch (error) {
        console.error('Download failed:', error);
        window.open(imageUrl, '_blank', 'noopener');
        trackDownload(photoId);
        showToast(t('dl_fail'), true);
    } finally {
        // Re-translate from the key (in case the language was switched while downloading).
        const key = label.dataset && label.dataset.i18n;
        if (key) {
            let vars;
            try { vars = label.dataset.i18nVars ? JSON.parse(label.dataset.i18nVars) : undefined; } catch { /* ignore */ }
            label.textContent = t(key, vars);
        } else {
            label.textContent = originalText;
        }
        button.disabled = false;
    }
});

/* ---------- photo detail view (opens when a card is clicked; arrows, swipe, keyboard, deep links) ----------
   Arrows stay physical left/right on purpose: ArrowLeft / swipe-right = previous in both languages.
   Deep links: opening a photo adds &photo=ID to the URL (one history entry), arrows only REPLACE it, so a single
   Back press always closes the viewer. A shared /?photo=ID link opens the viewer directly. */

const imageModal = $('#imageModal');
const modalImg = $('#modalImg');
const closeModalBtn = $('.close-modal');
const prevBtn = $('#prevImg');
const nextBtn = $('#nextImg');
const detailTitle = $('#detailTitle');
const detailAuthor = $('#detailAuthor');
const detailMeta = $('#detailMeta');
const detailActions = $('#detailActions');

let lbItems = [];      // metadata of the cards currently in the grid
let lbIndex = 0;
let lastFocused = null;

const lightboxOpen = () => imageModal.style.display === 'flex';

function metaRow(labelKey, value) {
    const row = document.createElement('div');
    row.className = 'detail-row';
    const dt = document.createElement('dt');
    dt.dataset.i18n = labelKey;
    dt.textContent = t(labelKey);
    const dd = document.createElement('dd');
    dd.textContent = value;
    row.append(dt, dd);
    return row;
}

function makeDetailFavButton(meta) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'detailFav';
    btn.className = 'detail-fav-btn';
    btn.dataset.src = meta.imageUrl;
    const label = document.createElement('span');
    label.className = 'btn-label';
    btn.append(makeIcon('heart'), label);
    return btn;
}

// "Copy link": same look as the secondary download button (no new CSS). Handled at the top of the download click handler.
function makeShareButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'download-btn secondary';
    btn.dataset.action = 'share';
    const text = document.createElement('span');
    text.className = 'btn-label';
    text.dataset.i18n = 'share_link';
    text.textContent = t('share_link');
    btn.append(makeIcon('link'), text);
    return btn;
}

function shareDetail() {
    const meta = lbItems[lbIndex];
    if (!meta || !meta.photoId) return;
    const url = location.origin + '/?photo=' + encodeURIComponent(meta.photoId);   // clean link: no q / o / view
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
        navigator.share({ url }).catch(() => { /* cancelled */ });
    } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => showToast(t('link_copied')), () => { /* blocked */ });
    }
}

function paintDetailFavorite() {
    const btn = $('#detailFav');
    const meta = lbItems[lbIndex];
    if (!btn || !meta) return;
    const isFav = favoriteKeys.has(photoKey(meta.imageUrl));
    btn.classList.toggle('is-favorite', isFav);
    btn.setAttribute('aria-pressed', String(isFav));
    btn.querySelector('.btn-label').textContent = t(isFav ? 'fav_remove' : 'fav_add');
}

// Text side of the panel (also re-run when the language changes).
function renderDetailInfo() {
    const meta = lbItems[lbIndex];
    if (!meta) return;

    detailTitle.textContent = meta.title || t('wp_default');
    detailAuthor.replaceChildren(buildSubtitle(meta));   // "Photo by <name> on Unsplash" (linked, with UTM), or the upload description

    detailMeta.replaceChildren();
    if (meta.width && meta.height) {
        detailMeta.append(
            metaRow('detail_dimensions', `\u2066${meta.width} × ${meta.height} px\u2069`),
            metaRow('detail_quality', getQualityLabel(meta.width, meta.height).text)
        );
    }
    detailMeta.hidden = !detailMeta.childElementCount;

    detailActions.replaceChildren();
    if (meta.rawUrl && meta.photoId) {
        const { w, h } = smartSize(meta);
        detailActions.append(
            makeDownloadButton({ labelKey: 'dl_screen', vars: { w, h }, mode: 'screen', key: meta.imageUrl, photoId: meta.photoId }),
            makeDownloadButton({ labelKey: 'dl_original', url: meta.rawUrl, photoId: meta.photoId, secondary: true })
        );
    } else {
        detailActions.append(makeDownloadButton({ labelKey: 'dl_full', url: meta.downloadUrl }));
    }
    if (meta.photoId) detailActions.append(makeShareButton());   // uploads and static cards have no public id
    detailActions.append(makeDetailFavButton(meta));
    paintDetailFavorite();
}

// urlMode: 'push' = opening (new history entry), 'replace' = arrows, 'none' = the URL is already right
function renderDetail(urlMode = 'replace') {
    const meta = lbItems[lbIndex];
    if (!meta) return;
    if (window.GWBlur) window.GWBlur.reset();     // new wallpaper -> blur back to 0px
    const full = meta.fullUrl || meta.imageUrl;
    const preview = meta.thumbUrl || full;

    modalImg.alt = meta.title || '';
    modalImg.src = preview;                       // already cached from the grid, so it shows instantly
    if (full !== preview) {                       // then swap in the sharp version once it has loaded
        const loader = new Image();
        loader.onload = () => { if (lightboxOpen() && lbItems[lbIndex] === meta) modalImg.src = full; };
        loader.src = full;
    }

    renderDetailInfo();
    prevBtn.hidden = nextBtn.hidden = lbItems.length < 2;
    syncDetailUrl(meta, urlMode);
}

// Keeps ?photo=ID in the address bar in step with the photo on screen.
function syncDetailUrl(meta, mode) {
    detailPhotoId = meta.photoId || null;
    if (mode === 'none') return;
    const url = currentUrl();
    if (url === location.pathname + location.search) return;
    if (mode === 'push') history.pushState({ lb: 1 }, '', url);
    else history.replaceState(history.state, '', url);
}

function showDetail(items, index, pushUrl) {
    lbItems = items;
    lbIndex = index;
    if (!lightboxOpen()) lastFocused = document.activeElement;
    imageModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    renderDetail(pushUrl ? 'push' : 'none');
    closeModalBtn.focus();
}

function openDetail(card, pushUrl = true) {
    const items = [...container.querySelectorAll('.card:not([hidden])')]   // hidden (color-filtered) cards are skipped
        .map(c => wallpaperRegistry.get(c.dataset.key))
        .filter(Boolean);
    showDetail(items, Math.max(0, items.findIndex(m => m.imageUrl === card.dataset.key)), pushUrl);
}

// UI only: the URL is already handled by the caller.
function hideDetail() {
    detailPhotoId = null;
    imageModal.style.display = 'none';
    if (window.GWBlur) window.GWBlur.reset();     // closing -> blur back to 0px
    modalImg.removeAttribute('src');
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
}

function closeLightbox() {
    if (!lightboxOpen()) return;
    if (history.state && history.state.lb) { history.back(); return; }   // popstate -> syncDetailFromUrl -> hideDetail
    detailPhotoId = null;                                                // opened by a direct link: stay inside the app
    if (new URLSearchParams(location.search).has('photo')) history.replaceState(null, '', currentUrl());
    hideDetail();
}

function stepLightbox(direction) {
    if (lbItems.length < 2) return;
    lbIndex = (lbIndex + direction + lbItems.length) % lbItems.length;
    renderDetail();
}

function findCardByPhotoId(id) {
    for (const c of container.querySelectorAll('.card:not([hidden])')) {
        const m = wallpaperRegistry.get(c.dataset.key);
        if (m && m.photoId === id) return c;
    }
    return null;
}

// Shared link to a photo that is not in the grid: fetch it once from our own backend.
let deepToken = 0;
async function openPhotoById(id) {
    const token = ++deepToken;
    try {
        const response = await fetch('/api/photos/' + encodeURIComponent(id));
        if (!response.ok) throw new Error(String(response.status));
        const meta = normalizeItem(await response.json());
        if (!meta || token !== deepToken || readUrlState().photo !== id) return;   // the URL moved on meanwhile
        wallpaperRegistry.set(meta.imageUrl, meta);   // the screen download and the heart look photos up here
        showDetail([meta], 0, false);
    } catch {
        if (token !== deepToken) return;
        history.replaceState(null, '', currentUrl());  // drop the dead ?photo=
        showToast(t('photo_missing'), true);
    }
}

// Called with the ?photo= id from the URL (or null) on load and on every Back / Forward.
function syncDetailFromUrl(id) {
    if (!id) { if (lightboxOpen()) hideDetail(); return; }
    const shown = lbItems[lbIndex];
    if (lightboxOpen() && shown && shown.photoId === id) return;
    const card = findCardByPhotoId(id);
    if (card) openDetail(card, false); else openPhotoById(id);
}

function trapFocus(e) {   // keeps Tab inside the open dialog
    const focusable = [...imageModal.querySelectorAll('button:not([hidden]):not(:disabled), a[href]')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

container.addEventListener('click', e => {
    const open = e.target.closest('.card-open');
    if (open) openDetail(open.closest('.card'));
});

closeModalBtn.addEventListener('click', closeLightbox);
prevBtn.addEventListener('click', () => stepLightbox(-1));
nextBtn.addEventListener('click', () => stepLightbox(1));
imageModal.addEventListener('click', e => { if (e.target === imageModal) closeLightbox(); });

let touchStartX = null;
imageModal.addEventListener('touchstart', e => {
    touchStartX = e.target.closest('.detail-media') ? e.changedTouches[0].clientX : null;   // swipe on the photo only
}, { passive: true });
imageModal.addEventListener('touchend', e => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(dx) > 50) stepLightbox(dx < 0 ? 1 : -1);
});

document.addEventListener('keydown', function (e) {
    if (lightboxOpen()) {
        if (e.key === 'Escape') closeLightbox();
        else if (e.key === 'ArrowLeft') stepLightbox(-1);
        else if (e.key === 'ArrowRight') stepLightbox(1);
        else if (e.key === 'Tab') trapFocus(e);
    } else if (e.key === 'Escape' && uploadDetails && uploadDetails.open) {
        uploadDetails.open = false;
    }
});


/* ---------- search + navigation ----------
   The search box is a real <form>: clicking "Search", pressing Enter and the phone keyboard's
   "search" key all fire ONE submit event, handled here. Nothing here touches the theme or the
   language (they live in <html> attributes + localStorage and are never reset by a search). */

function runSearch(raw) {
    const query = cleanSearchTerm(raw);
    if (!query) {
        showToast(t('enter_keyword'), true);
        searchInput.focus();
        return;
    }
    searchInput.value = query;           // show the cleaned keyword (extra spaces removed)
    searchInput.blur();                  // closes the on-screen keyboard on phones
    window.scrollTo({ top: 0 });
    fetchWallpapers(query);
}

searchForm.addEventListener('submit', e => {
    e.preventDefault();
    runSearch(searchInput.value);
});

// Emptying the box (backspace or the "x" inside the field) leaves the search and shows the normal wallpapers again.
searchInput.addEventListener('input', () => {
    if (searchInput.value.trim() === '' && currentView === 'search') showHome();
});

function quickSearch(keyword) { runSearch(keyword); }

$('.nav-links').addEventListener('click', e => {
    const link = e.target.closest('a');
    if (!link) return;
    if (link.dataset.search) {
        e.preventDefault();
        quickSearch(link.dataset.search);          // data-search stays English: it is the Unsplash keyword
    } else if (link.dataset.nav === 'home') {
        e.preventDefault();
        showHome();
    } else if (link.dataset.nav === 'favorites') {
        e.preventDefault();
        showFavoritesPage();
    }
});

/* ---------- contact form ---------- */

const usernameInput = $('#usernameInput');
const messageInput = $('#messageInput');
const sendBtn = $('#sendBtn');

sendBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    const text = messageInput.value.trim();

    if (!username || !text) {
        showToast(t('fill_contact'), true);
        return;
    }

    sendBtn.disabled = true;
    try {
        const response = await fetch('/api/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, text })
        });

        if (response.ok) {
            showToast(t('contact_ok'));
            usernameInput.value = '';
            messageInput.value = '';
        } else {
            const err = await response.json().catch(() => ({}));
            showToast(typeof err.detail === 'string' ? err.detail : t('contact_err'), true);
        }
    } catch (error) {
        console.error('Error', error);
        showToast(t('server_err'), true);
    } finally {
        sendBtn.disabled = false;
    }
});

/* ---------- wallpaper upload (saved as "pending" until approved in /admin) ---------- */

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;   // convenience only; the server enforces limits too
const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const uploadForm = $('#uploadForm');
const uploadFileInput = $('#uploadFile');
const uploadFileText = $('#uploadFileText');

// Shows the chosen file name, or the translated default hint.
function paintFileText() {
    if (!uploadFileText) return;
    const file = uploadFileInput && uploadFileInput.files && uploadFileInput.files[0];
    uploadFileText.textContent = file ? file.name : t('upload_choose');
}

if (uploadForm) {
    uploadFileInput.addEventListener('change', paintFileText);

    uploadForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const titleInput = $('#uploadTitle');
        const descriptionInput = $('#uploadDescription');
        const submitBtn = $('#uploadSubmitBtn');

        if (!uploadFileInput.files || uploadFileInput.files.length === 0) {
            showToast(t('upload_pick'), true);
            return;
        }
        const file = uploadFileInput.files[0];
        if (!UPLOAD_TYPES.includes(file.type)) {
            showToast(t('upload_type'), true);
            return;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
            showToast(t('upload_big'), true);
            return;
        }

        const formData = new FormData();
        // The fallback title is sent in English on purpose: it is stored on the server, whatever the UI language.
        formData.append('title', titleInput.value.trim() || 'Untitled Wallpaper');
        formData.append('description', descriptionInput.value.trim());
        formData.append('file', file);

        submitBtn.textContent = t('uploading');
        submitBtn.disabled = true;

        try {
            const response = await fetch('/api/upload-wallpaper', { method: 'POST', body: formData });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(typeof err.detail === 'string' ? err.detail : t('upload_fail'));
            }

            uploadForm.reset();
            paintFileText();
            if (uploadDetails) uploadDetails.open = false;
            showToast(t('upload_ok'));
        } catch (error) {
            console.error('Upload error:', error);
            showToast(error.message || t('upload_generic'), true);
        } finally {
            submitBtn.textContent = t('upload_submit');
            submitBtn.disabled = false;
        }
    });
}

/* ---------- favorites ----------
   Kept in memory and mirrored to localStorage. Matching uses photoKey(), so a favorite still
   shows its heart when the same photo comes back from Unsplash with a different URL. */

const FAVORITES_KEY = 'greenWingsFavorites';

function readFavorites() {
    try {
        const raw = JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
        return raw.map(normalizeItem).filter(Boolean);
    } catch { return []; }
}

let favorites = readFavorites();
let favoriteKeys = new Set(favorites.map(f => photoKey(f.imageUrl)));

function saveFavorites(list) {
    favorites = list;
    favoriteKeys = new Set(list.map(f => photoKey(f.imageUrl)));
    try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
    } catch {
        showToast(t('fav_storage'), true);
    }
}

function toggleFavorite(imageSrc) {
    const key = photoKey(imageSrc);
    const list = [...favorites];
    const index = list.findIndex(f => photoKey(f.imageUrl) === key);

    if (index === -1) {
        const meta = wallpaperRegistry.get(imageSrc) || normalizeItem(imageSrc);
        if (meta) list.push(meta);
    } else {
        list.splice(index, 1);
    }
    saveFavorites(list);

    if (lightboxOpen()) paintDetailFavorite();

    if (currentView === 'favorites') showFavoritesPage(null);
    else updateFavoriteButtons();
}

// Cheap: the heart only changes when the state changed; the aria-label also follows the language.
function updateFavoriteButtons() {
    document.querySelectorAll('.favorite-btn').forEach(btn => {
        if (!btn.querySelector('svg')) btn.replaceChildren(makeIcon('heart'));
        const isFav = favoriteKeys.has(photoKey(btn.getAttribute('data-src')));
        const label = t(isFav ? 'fav_remove' : 'fav_add');
        if (btn.getAttribute('aria-label') !== label) btn.setAttribute('aria-label', label);
        if (btn.getAttribute('aria-pressed') === String(isFav)) return;
        btn.classList.toggle('is-favorite', isFav);
        btn.setAttribute('aria-pressed', String(isFav));   // the heart fill is done in CSS now
    });
}
document.addEventListener('click', function (event) {
    const btn = event.target.closest('.favorite-btn, .detail-fav-btn');   // was only .favorite-btn
    if (!btn) return;
    event.stopPropagation();

    const imgSrc = btn.getAttribute('data-src');
    if (imgSrc) {
        toggleFavorite(imgSrc);
    }
});

/* ---------- theme (Dark / Light) ----------
   - The whole theme is the data-theme attribute on <html>; style_23.css swaps CSS variables under it,
     so a toggle repaints without touching the DOM or re-rendering any card.
   - theme-init.js (in <head>) applies the saved theme before the first paint; this code takes over from there.
   - The preference lives in localStorage under 'greenWingsTheme' ('dark' | 'light'). Dark is the default.
   - The button label/tooltip are translated, so applyLanguage() calls paintThemeButton() too. */

const THEME_KEY = 'greenWingsTheme';
const THEMES = ['dark', 'light'];
const THEME_COLORS = { dark: '#0a0a0a', light: '#f4f7f5' };   // browser UI colour on phones (<meta name="theme-color">)

function loadTheme() {
    try {
        const v = localStorage.getItem(THEME_KEY);
        if (THEMES.includes(v)) return v;
    } catch { /* storage unavailable */ }
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

let theme = loadTheme();
let themeFadeTimer = null;

// Label + tooltip describe the ACTION (what a click will do), in the current language.
function paintThemeButton() {
    if (!themeToggle) return;
    const label = t(theme === 'dark' ? 'theme_to_light' : 'theme_to_dark');
    themeToggle.setAttribute('aria-label', label);
    themeToggle.setAttribute('title', label);
}

function applyTheme() {
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLORS[theme]);
    paintThemeButton();
}

function setTheme(next) {
    if (!THEMES.includes(next) || next === theme) return;
    theme = next;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* storage unavailable: works until reload */ }

    // A short colour fade, only while switching (see the .theme-fade block at the end of style_23.css).
    const root = document.documentElement;
    root.classList.add('theme-fade');
    applyTheme();
    clearTimeout(themeFadeTimer);
    themeFadeTimer = setTimeout(() => root.classList.remove('theme-fade'), 300);
}

if (themeToggle) {
    themeToggle.addEventListener('click', () => setTheme(theme === 'dark' ? 'light' : 'dark'));
}

/* ---------- language switcher (EN | AR) ---------- */

function paintLangButtons() {
    document.querySelectorAll('.lang-btn').forEach(b => {
        const on = b.dataset.lang === lang;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
    });
}

// Applies the current `lang` to the whole page: direction, static texts, titles, dynamic cards.
function applyLanguage() {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';

    applyI18n(document);               // also re-translates the search placeholder, its aria-label, the button text, the card tooltips, the pill labels and the color swatch labels / tooltips
    paintLangButtons();
    paintThemeButton();                // the theme button's label follows the language
    paintFileText();
    paintTitles();
    paintCategories();                 // pill widths change with the language: keep the active pill centred
    paintFeatured()
    document.querySelectorAll('.attribution').forEach(fillAttribution);
    updateFavoriteButtons();
    if (lightboxOpen()) renderDetailInfo();
    if (currentView === 'favorites') showFavoritesPage(null);   // re-render: favorites are local, no network needed
}

function setLanguage(next) {
    if (!LANGS.includes(next) || next === lang) return;
    lang = next;
    try { localStorage.setItem(LANG_KEY, lang); } catch { /* storage unavailable: works until reload */ }
    applyLanguage();
}

const langSwitcher = $('.lang-switcher');
if (langSwitcher) {
    langSwitcher.addEventListener('click', e => {
        const btn = e.target.closest('.lang-btn');
        if (btn) setLanguage(btn.dataset.lang);
    });
}

// Keep several open tabs in sync (favorites + language + theme).
window.addEventListener('storage', e => {
    if (e.key === LANG_KEY) {
        const next = loadLang();
        if (next !== lang) { lang = next; applyLanguage(); }
    } else if (e.key === THEME_KEY) {
        const next = loadTheme();
        if (next !== theme) { theme = next; applyTheme(); }
    } else if (e.key === FAVORITES_KEY) {
        favorites = readFavorites();
        favoriteKeys = new Set(favorites.map(f => photoKey(f.imageUrl)));
        if (currentView === 'favorites') showFavoritesPage(null);
        else updateFavoriteButtons();
    }
});

/* ---------- back to top ----------
   IntersectionObserver on an invisible marker instead of a scroll listener:
   no JavaScript runs while the page is scrolling. */

const topBtn = $('#backToTop');
const topSentinel = $('#top-sentinel');
if (topBtn) {
    if (topSentinel && 'IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => {
            topBtn.classList.toggle('show', !entry.isIntersecting && entry.boundingClientRect.top < 0);
        }).observe(topSentinel);
    } else {
        window.addEventListener('scroll', () => {
            topBtn.classList.toggle('show', window.scrollY > 400);
        }, { passive: true });
    }
    topBtn.addEventListener('click', () => window.scrollTo({ top: 0 }));
}
/* ---------- Wallpaper of the Day ----------
   - GET /api/wallpaper-of-the-day returns either an uploaded wallpaper (same fields as /api/wallpapers) or an
     Unsplash photo (same fields as /api/photos). They go through uploadMeta() / normalizeItem(), so the meta
     object is IDENTICAL to a grid card's: it is put into wallpaperRegistry and opened with showDetail(), so the
     lightbox, Smart Blur, screen-resolution download, share link and favorites all work unchanged.
   - Zero layout shift: #wotd-card has a fixed height in CSS and is visible (as an empty block) from the first
     paint. The blurred placeholder (lqip / blur_hash) is shown at once and removed when the sharp image is ready.
   - Hidden (not removed) outside the home view; hidden for good if the first request fails. */

const WOTD_URL = '/api/wallpaper-of-the-day';
const WOTD_SIZES = '(max-width: 1700px) 100vw, 1700px';
const utcDay = () => new Date().toISOString().slice(0, 10);

function syncFeaturedVisibility() {
    if (wotdSection) wotdSection.hidden = currentView !== 'home' || featuredFailed;
}

// Builds the card from featuredMeta. Also re-run on a language change (the card is tiny and the image is cached).
function paintFeatured() {
    if (!wotdCard || !featuredMeta) return;
    const meta = featuredMeta;
    const title = meta.title || t('wp_default');
    wallpaperRegistry.set(meta.imageUrl, meta);

    wotdCard.style.backgroundColor = /^#[0-9a-f]{3,8}$/i.test(meta.color || '') ? meta.color : '';

    const img = document.createElement('img');
    img.className = 'wotd-img';
    img.alt = '';                                      // decorative: the button below carries the accessible name
    img.decoding = 'async';
    img.loading = 'lazy';
    if (meta.thumbSrcset) {                            // Unsplash: 400-1600 px WebP candidates
        img.sizes = WOTD_SIZES;
        img.srcset = meta.thumbSrcset;
    }
    img.src = meta.thumbUrl || meta.imageUrl;          // uploads: the server-made 800 px WebP

    const placeholderUrl = placeholderFor(meta);
    let placeholder = null;
    if (placeholderUrl) {
        placeholder = document.createElement('div');
        placeholder.className = 'card-lqip';
        placeholder.setAttribute('aria-hidden', 'true');
        placeholder.style.backgroundImage = `url("${placeholderUrl}")`;
    }
    revealWhenLoaded(img, placeholder);

    const scrim = document.createElement('div');
    scrim.className = 'wotd-scrim';
    scrim.setAttribute('aria-hidden', 'true');

    const badge = document.createElement('span');
    badge.className = 'wotd-badge';
    const badgeText = document.createElement('span');
    badgeText.dataset.i18n = 'wotd_title';
    badgeText.textContent = t('wotd_title');
    badge.append(makeIcon('star'), badgeText);

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'wotd-open';
    const label = t('wotd_open_aria', { title: '\u2068' + title + '\u2069' });
    open.setAttribute('aria-label', label);
    open.title = label;

    const favBtn = document.createElement('button');  // the global .favorite-btn handler does the rest
    favBtn.type = 'button';
    favBtn.className = 'favorite-btn';
    favBtn.setAttribute('data-src', meta.imageUrl);
    favBtn.setAttribute('aria-label', t('fav_add'));
    favBtn.setAttribute('aria-pressed', 'false');
    favBtn.append(makeIcon('heart'));

    const titleEl = document.createElement('div');
    titleEl.className = 'wotd-title';
    titleEl.dir = 'auto';                              // Latin titles stay tidy inside Arabic pages
    titleEl.textContent = title;

    const credit = buildSubtitle(meta);                // "Photo by <name> on Unsplash" (linked) or the upload text
    credit.classList.add('wotd-credit');

    const text = document.createElement('div');
    text.className = 'wotd-text';
    text.append(titleEl, credit);

    const cta = document.createElement('span');
    cta.className = 'wotd-cta';
    cta.setAttribute('aria-hidden', 'true');
    cta.dataset.i18n = 'wotd_view';
    cta.textContent = t('wotd_view');

    const body = document.createElement('div');
    body.className = 'wotd-body';
    body.append(text, cta);

    wotdCard.replaceChildren(...[placeholder, img, scrim, badge, open, favBtn, body].filter(Boolean));
    wotdSection.removeAttribute('aria-busy');
    updateFavoriteButtons();
}

async function loadFeatured() {
    if (!wotdCard) return;
    try {
        const response = await fetch(WOTD_URL);
        if (!response.ok) throw new Error(String(response.status));
        const data = await response.json();
        const meta = data && data.urls ? normalizeItem(data) : data && data.image_url ? uploadMeta(data) : null;
        if (!meta) throw new Error('Unexpected payload');
        featuredMeta = meta;
        featuredDay = typeof data.date === 'string' ? data.date : utcDay();
        featuredFailed = false;
        paintFeatured();
    } catch (error) {
        console.warn('Wallpaper of the Day unavailable:', error);
        if (!featuredMeta) featuredFailed = true;      // a failed REFRESH keeps yesterday's card instead
    } finally {
        syncFeaturedVisibility();
    }
}

if (wotdCard) {
    wotdCard.addEventListener('click', e => {
        if (!featuredMeta || !e.target.closest('.wotd-open')) return;
        showDetail([featuredMeta], 0, true);           // Unsplash photos get ?photo=ID (shareable); uploads keep the URL
    });
}

// A tab left open across UTC midnight picks up the new wallpaper when it becomes visible again.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && featuredMeta && featuredDay !== utcDay()) loadFeatured();
});

/* ---------- footer: About + Privacy modals ----------
   Native <dialog> + showModal(): the browser provides the focus trap, Escape, ::backdrop and an inert page behind it.
   The texts are static markup with data-i18n, so applyLanguage() translates them (and RTL flips) with no extra code.
   No innerHTML, no inline handlers. */

const INFO_DIALOGS = { about: $('#aboutDialog'), privacy: $('#privacyDialog'), impressum: $('#impressumDialog') };
let infoOpener = null;                                   // the button to give focus back to on close

function openInfo(name) {
    const dlg = INFO_DIALOGS[name];
    if (!dlg || dlg.open || typeof dlg.showModal !== 'function') return;
    if (uploadDetails) uploadDetails.open = false;
    infoOpener = document.activeElement;
    document.documentElement.classList.add('info-lock');
    dlg.showModal();
    const body = dlg.querySelector('.info-body');
    if (body) body.scrollTop = 0;
}

Object.values(INFO_DIALOGS).forEach(dlg => {
    if (!dlg) return;
    // Close on a click on the dark backdrop, but not when a text selection merely ends there.
    let pressedBackdrop = false;
    dlg.addEventListener('pointerdown', e => { pressedBackdrop = e.target === dlg; });
    dlg.addEventListener('click', e => { if (e.target === dlg && pressedBackdrop) dlg.close(); });
    dlg.addEventListener('close', () => {                // fires for Escape, buttons and backdrop alike
        document.documentElement.classList.remove('info-lock');
        if (infoOpener && infoOpener.isConnected) infoOpener.focus();
        infoOpener = null;
    });
});

document.addEventListener('click', e => {
    const opener = e.target.closest('[data-info-open]');
    if (opener) { openInfo(opener.dataset.infoOpen); return; }
    const closer = e.target.closest('[data-info-close]');
    if (closer) {
        const dlg = closer.closest('dialog');
        if (dlg) dlg.close();
    }
});

/* ---------- init ---------- */

applyTheme();          // saved theme (localStorage) -> data-theme + browser UI color; theme-init.js already did the first paint
applyLanguage();       // saved language (localStorage) -> dir/lang + all static texts, BEFORE the static cards are registered
paintOrientation();
initStaticCards();
updateFavoriteButtons();
loadUploadedWallpapers();
loadFeatured()
applyUrlState(true);   // opens ?q=... / ?view=favorites / ?photo=ID links directly

if (currentView === 'home') loadHomeMix();  // plain visit to "/" (no ?q= / ?view=)


/* ---------- PWA: service worker ---------- */

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* blocked / unsupported: the site works normally */ });
    });
}