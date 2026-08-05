window.MOCK_PURCHASE_REQUESTS = [
  {
    id: "REQ-026",
    title: "شراء كابلات كهربائية لمشروع التوسعة",
    type: "materials",
    department: "engineering",
    created: true,
    quotes: true,
    purchased: false,
    settled: false,
    initialPrice: 27500000,
    description: "تأمين كابلات نحاسية بمقاسات مختلفة لاستكمال التمديدات الكهربائية في الموقع الجديد، مع مراعاة المواصفات الفنية المعتمدة وكميات كل مقاس.",
    createdAt: "2026-07-29",
    offersCount: 3,
    supplier: "لم يتم الاختيار بعد",
    attachments: [
      {
        name: "عرض سعر للكابلات",
        url: "assets/images/sample-offer.svg"
      }
    ],
    notes: [
      {
        id: "NOTE-026-1",
        text: "تم استلام العرض الثالث وإضافته للمقارنة.",
        authorId: "user-ahmad",
        authorName: "أحمد",
        createdAt: "2026-08-02T09:20:00"
      },
      {
        id: "NOTE-026-2",
        text: "يرجى التأكد من سماكة العازل قبل الاعتماد.",
        authorId: "user-basel",
        authorName: "باسل",
        createdAt: "2026-08-03T11:15:00"
      }
    ]
  },
  {
    id: "REQ-025",
    title: "صيانة مضخة المياه الرئيسية",
    type: "work-order",
    department: "operations",
    created: true,
    quotes: true,
    purchased: true,
    settled: true,
    initialPrice: 8800000,
    description: "فك المضخة ونقلها إلى الورشة وتبديل الرولمانات والأختام ثم إعادة تركيبها وتجربتها وتسليم تقرير مختصر عن الأعمال المنفذة.",
    createdAt: "2026-07-26",
    offersCount: 2,
    supplier: "ورشة النخبة",
    attachments: [
      {
        name: "صورة أمر التشغيل",
        url: "assets/images/sample-work-order.svg"
      },
      {
        name: "صورة المضخة",
        url: "assets/images/sample-item.svg"
      }
    ],
    notes: [
      {
        id: "NOTE-025-1",
        text: "تم التنفيذ والتجربة بنجاح وتمت التصفية.",
        authorId: "user-mahmoud",
        authorName: "محمود",
        createdAt: "2026-07-31T14:05:00"
      }
    ]
  },
  {
    id: "REQ-024",
    title: "شراء مستلزمات السلامة للمخزن",
    type: "materials",
    department: "technical",
    created: true,
    quotes: false,
    purchased: false,
    settled: false,
    initialPrice: 12100000,
    description: "خوذ وقفازات ونظارات حماية وسترات عاكسة للعاملين في المخزن، وفق المقاسات والكميات المبينة في الكشف المرفق.",
    createdAt: "2026-07-24",
    offersCount: 0,
    supplier: "—",
    attachments: [],
    notes: []
  },
  {
    id: "REQ-023",
    title: "تشغيل رافعة إضافية لمدة ثلاثة أيام",
    type: "work-order",
    department: "operations",
    created: true,
    quotes: false,
    purchased: false,
    settled: false,
    initialPrice: 16200000,
    description: "استئجار رافعة مع سائق لمدة ثلاثة أيام لدعم أعمال التحميل في الساحة الخارجية ضمن ساعات التشغيل المحددة.",
    createdAt: "2026-07-22",
    offersCount: 0,
    supplier: "—",
    attachments: [
      {
        name: "مخطط موقع العمل",
        url: "assets/images/sample-item.svg"
      }
    ],
    notes: [
      {
        id: "NOTE-023-1",
        text: "يجب تأكيد تاريخ بدء العمل قبل الاتفاق النهائي.",
        authorId: "user-basel",
        authorName: "باسل",
        createdAt: "2026-07-25T10:00:00"
      }
    ]
  },
  {
    id: "REQ-022",
    title: "شراء أحبار للطابعات الإدارية",
    type: "materials",
    department: "operations",
    created: true,
    quotes: true,
    purchased: true,
    settled: false,
    initialPrice: 3150000,
    description: "أحبار أصلية لثلاث طابعات مستخدمة في الإدارة والمحاسبة مع بيان أرقام الموديلات والكميات المطلوبة.",
    createdAt: "2026-07-18",
    offersCount: 3,
    supplier: "شركة المكتب الحديث",
    attachments: [
      {
        name: "الفاتورة",
        url: "assets/images/sample-offer.svg"
      }
    ],
    notes: [
      {
        id: "NOTE-022-1",
        text: "تم الاستلام وإرسال الفاتورة إلى المحاسبة.",
        authorId: "user-layla",
        authorName: "ليلى",
        createdAt: "2026-07-28T13:30:00"
      }
    ]
  },
  {
    id: "REQ-021",
    title: "إصلاح باب المستودع المعدني",
    type: "work-order",
    department: "engineering",
    created: true,
    quotes: true,
    purchased: false,
    settled: false,
    initialPrice: 6900000,
    description: "إصلاح مسار الباب وتبديل العجلات السفلية وإعادة ضبط الإغلاق مع اختبار الحركة بعد انتهاء العمل.",
    createdAt: "2026-07-15",
    offersCount: 2,
    supplier: "قيد المقارنة",
    attachments: [],
    notes: [
      {
        id: "NOTE-021-1",
        text: "العرض الثاني أقل سعرًا لكنه يحتاج يومين إضافيين.",
        authorId: "user-ahmad",
        authorName: "أحمد",
        createdAt: "2026-07-21T08:10:00"
      }
    ]
  },
  {
    id: "REQ-020",
    title: "شراء بطاريات لأجهزة القياس",
    type: "materials",
    department: "technical",
    created: true,
    quotes: true,
    purchased: true,
    settled: true,
    initialPrice: 1540000,
    description: "بطاريات صناعية قابلة للشحن لأجهزة القياس المحمولة، بنفس المواصفات والجهد المستخدم حاليًا.",
    createdAt: "2026-07-12",
    offersCount: 2,
    supplier: "المورد التقني",
    attachments: [
      {
        name: "صورة المواد",
        url: "assets/images/sample-item.svg"
      }
    ],
    notes: []
  },
  {
    id: "REQ-019",
    title: "تنظيف خزانات المياه",
    type: "work-order",
    department: "operations",
    created: true,
    quotes: false,
    purchased: false,
    settled: false,
    initialPrice: 9800000,
    description: "تنظيف وتعقيم خزانين للمياه مع تقديم تقرير مختصر بعد التنفيذ وإرفاق صور قبل وبعد العمل.",
    createdAt: "2026-07-09",
    offersCount: 0,
    supplier: "—",
    attachments: [],
    notes: []
  }
];
