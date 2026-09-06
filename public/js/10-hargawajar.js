// ==========================================
// HARGA WAJAR — MoS Valuation Engine
// Metodologi: EPS-based IRR + Future Stock Price (9-Step Warren Buffett & Value Investing)
// Real Data Reference: Google Sheets Form MoS & Finc State
// ==========================================

var STOCK_FINANCIAL_DATABASE = {
  "GGRM": {
    "ticker": "GGRM",
    "price": 15800,
    "rows": [
      {
        "year": 2020,
        "eps": 298.43,
        "equity": 120.889,
        "shares": 99062,
        "dps": 163.82,
        "per": 15.76,
        "netIncome": 29563
      },
      {
        "year": 2021,
        "eps": 342.69,
        "equity": 145.399,
        "shares": 99062,
        "dps": 154.07,
        "per": 16.16,
        "netIncome": 33948
      },
      {
        "year": 2022,
        "eps": 279.42,
        "equity": 149.262,
        "shares": 99062,
        "dps": 168.01,
        "per": 17.9,
        "netIncome": 27680
      },
      {
        "year": 2023,
        "eps": 325.13,
        "equity": 156.562,
        "shares": 99062,
        "dps": 149.97,
        "per": 15.93,
        "netIncome": 32208
      },
      {
        "year": 2024,
        "eps": 301.22,
        "equity": 154.351,
        "shares": 99062,
        "dps": 167.6,
        "per": 50.08,
        "netIncome": 29840
      }
    ]
  },
  "BBNI": {
    "ticker": "BBNI",
    "price": 5250,
    "rows": [
      {
        "year": 2020,
        "eps": 176,
        "equity": 112872,
        "shares": 37295,
        "dps": 44,
        "per": 35.1,
        "netIncome": 3280
      },
      {
        "year": 2021,
        "eps": 292,
        "equity": 126515,
        "shares": 37295,
        "dps": 73,
        "per": 23.1,
        "netIncome": 10899
      },
      {
        "year": 2022,
        "eps": 491,
        "equity": 140197,
        "shares": 37295,
        "dps": 196,
        "per": 18.8,
        "netIncome": 18312
      },
      {
        "year": 2023,
        "eps": 561,
        "equity": 154351,
        "shares": 37295,
        "dps": 280,
        "per": 9.6,
        "netIncome": 20906
      },
      {
        "year": 2024,
        "eps": 653,
        "equity": 170200,
        "shares": 37295,
        "dps": 326,
        "per": 8,
        "netIncome": 24350
      }
    ]
  },
  "CPRI": {
    "ticker": "CPRI",
    "price": 50,
    "rows": [
      {
        "year": 2020,
        "eps": 458.73,
        "equity": 195.454,
        "shares": 40484,
        "dps": 211.13,
        "per": 15.09,
        "netIncome": 18.571
      },
      {
        "year": 2021,
        "eps": 632.01,
        "equity": 215.615,
        "shares": 40484,
        "dps": 184,
        "per": 11.43,
        "netIncome": 25.586
      },
      {
        "year": 2022,
        "eps": 998.43,
        "equity": 243.72,
        "shares": 40484,
        "dps": 132,
        "per": 7.97,
        "netIncome": 40.42
      },
      {
        "year": 2023,
        "eps": 1099.24,
        "equity": 250.418,
        "shares": 40484,
        "dps": 282,
        "per": 6.76,
        "netIncome": 44.501
      },
      {
        "year": 2024,
        "eps": 1072.63,
        "equity": 271.496,
        "shares": 40484,
        "dps": 650,
        "per": 5.83,
        "netIncome": 43.424
      }
    ]
  },
  "BBCA": {
    "ticker": "BBCA",
    "price": 9850,
    "rows": [
      {
        "year": 2020,
        "eps": 220,
        "equity": 184714,
        "shares": 123275,
        "dps": 88,
        "per": 24.5,
        "netIncome": 27131
      },
      {
        "year": 2021,
        "eps": 255,
        "equity": 203848,
        "shares": 123275,
        "dps": 110,
        "per": 28.6,
        "netIncome": 31423
      },
      {
        "year": 2022,
        "eps": 330,
        "equity": 221183,
        "shares": 123275,
        "dps": 145,
        "per": 25.9,
        "netIncome": 40736
      },
      {
        "year": 2023,
        "eps": 395,
        "equity": 244243,
        "shares": 123275,
        "dps": 205,
        "per": 23.8,
        "netIncome": 48639
      },
      {
        "year": 2024,
        "eps": 442,
        "equity": 271496,
        "shares": 123275,
        "dps": 245,
        "per": 22.3,
        "netIncome": 54480
      }
    ]
  },
  "BMRI": {
    "ticker": "BMRI",
    "price": 6850,
    "rows": [
      {
        "year": 2020,
        "eps": 367,
        "equity": 193882,
        "shares": 46666,
        "dps": 220,
        "per": 17.2,
        "netIncome": 17119
      },
      {
        "year": 2021,
        "eps": 601,
        "equity": 204687,
        "shares": 46666,
        "dps": 360,
        "per": 11.7,
        "netIncome": 28028
      },
      {
        "year": 2022,
        "eps": 882,
        "equity": 233580,
        "shares": 46666,
        "dps": 529,
        "per": 11.3,
        "netIncome": 41171
      },
      {
        "year": 2023,
        "eps": 1180,
        "equity": 260381,
        "shares": 46666,
        "dps": 708,
        "per": 10.2,
        "netIncome": 55060
      },
      {
        "year": 2024,
        "eps": 1310,
        "equity": 288450,
        "shares": 46666,
        "dps": 786,
        "per": 9.5,
        "netIncome": 61130
      }
    ]
  },
  "BBRI": {
    "ticker": "BBRI",
    "price": 4850,
    "rows": [
      {
        "year": 2020,
        "eps": 151,
        "equity": 199909,
        "shares": 151559,
        "dps": 98,
        "per": 27.6,
        "netIncome": 18660
      },
      {
        "year": 2021,
        "eps": 205,
        "equity": 288733,
        "shares": 151559,
        "dps": 128,
        "per": 20,
        "netIncome": 31067
      },
      {
        "year": 2022,
        "eps": 339,
        "equity": 300337,
        "shares": 151559,
        "dps": 231,
        "per": 14.6,
        "netIncome": 51408
      },
      {
        "year": 2023,
        "eps": 399,
        "equity": 315993,
        "shares": 151559,
        "dps": 285,
        "per": 13.9,
        "netIncome": 60426
      },
      {
        "year": 2024,
        "eps": 412,
        "equity": 335400,
        "shares": 151559,
        "dps": 300,
        "per": 11.8,
        "netIncome": 62450
      }
    ]
  },
  "ERAA": {
    "ticker": "ERAA",
    "price": 430,
    "rows": [
      {
        "year": 2020,
        "eps": 115.84,
        "equity": 28.089,
        "shares": 9936,
        "dps": 41,
        "per": 44,
        "netIncome": 1.151
      },
      {
        "year": 2021,
        "eps": 238.22,
        "equity": 30.761,
        "shares": 9936,
        "dps": 83,
        "per": 20,
        "netIncome": 2.367
      },
      {
        "year": 2022,
        "eps": 314.5,
        "equity": 36.716,
        "shares": 9936,
        "dps": 47.3,
        "per": 23,
        "netIncome": 3.125
      },
      {
        "year": 2023,
        "eps": 426.21,
        "equity": 39.594,
        "shares": 9936,
        "dps": 149,
        "per": 10,
        "netIncome": 4.235
      },
      {
        "year": 2024,
        "eps": 477,
        "equity": 20025,
        "shares": 40000,
        "dps": 89.6,
        "per": 15,
        "netIncome": 3000
      }
    ]
  },
  "UNVR": {
    "ticker": "UNVR",
    "price": 2450,
    "rows": [
      {
        "year": 2020,
        "eps": 188,
        "equity": 4937,
        "shares": 38150,
        "dps": 187,
        "per": 39.1,
        "netIncome": 7164
      },
      {
        "year": 2021,
        "eps": 151,
        "equity": 4321,
        "shares": 38150,
        "dps": 150,
        "per": 27.2,
        "netIncome": 5758
      },
      {
        "year": 2022,
        "eps": 141,
        "equity": 3996,
        "shares": 38150,
        "dps": 140,
        "per": 33.3,
        "netIncome": 5365
      },
      {
        "year": 2023,
        "eps": 126,
        "equity": 3381,
        "shares": 38150,
        "dps": 125,
        "per": 27.8,
        "netIncome": 4801
      },
      {
        "year": 2024,
        "eps": 88,
        "equity": 3200,
        "shares": 38150,
        "dps": 88,
        "per": 27.8,
        "netIncome": 3350
      }
    ]
  },
  "ADRO": {
    "ticker": "ADRO",
    "price": 3650,
    "rows": [
      {
        "year": 2020,
        "eps": 68,
        "equity": 54100,
        "shares": 31985,
        "dps": 45,
        "per": 21,
        "netIncome": 2180
      },
      {
        "year": 2021,
        "eps": 462,
        "equity": 62900,
        "shares": 31985,
        "dps": 160,
        "per": 4.9,
        "netIncome": 14780
      },
      {
        "year": 2022,
        "eps": 1250,
        "equity": 101200,
        "shares": 31985,
        "dps": 500,
        "per": 3.1,
        "netIncome": 39980
      },
      {
        "year": 2023,
        "eps": 805,
        "equity": 114500,
        "shares": 31985,
        "dps": 400,
        "per": 3,
        "netIncome": 25740
      },
      {
        "year": 2024,
        "eps": 680,
        "equity": 125000,
        "shares": 31985,
        "dps": 340,
        "per": 5.4,
        "netIncome": 21750
      }
    ]
  },
  "SIDO": {
    "ticker": "SIDO",
    "price": 550,
    "rows": [
      {
        "year": 2020,
        "eps": 32.61,
        "equity": 1.533,
        "shares": 3067,
        "dps": 3.25,
        "per": 29,
        "netIncome": 100
      },
      {
        "year": 2021,
        "eps": 68.8,
        "equity": 1.533,
        "shares": 3067,
        "dps": 24,
        "per": 23,
        "netIncome": 211
      },
      {
        "year": 2022,
        "eps": 33.91,
        "equity": 1.533,
        "shares": 3067,
        "dps": 3.15,
        "per": 60,
        "netIncome": 104
      },
      {
        "year": 2023,
        "eps": 55.43,
        "equity": 1.533,
        "shares": 3067,
        "dps": 10.06,
        "per": 28,
        "netIncome": 170
      },
      {
        "year": 2024,
        "eps": "",
        "equity": "",
        "shares": 3067,
        "dps": "",
        "per": "",
        "netIncome": ""
      }
    ]
  },
  "PGEO": {
    "ticker": "PGEO",
    "price": 1180,
    "rows": [
      {
        "year": 2020,
        "eps": 2.2,
        "equity": 41.116,
        "shares": 93389,
        "dps": 1,
        "per": 174,
        "netIncome": 205
      },
      {
        "year": 2021,
        "eps": 45.25,
        "equity": 60.994,
        "shares": 93389,
        "dps": 16,
        "per": 51,
        "netIncome": 4.226
      },
      {
        "year": 2022,
        "eps": 5.38,
        "equity": 58.032,
        "shares": 93389,
        "dps": 2,
        "per": 2.603,
        "netIncome": 502
      },
      {
        "year": 2023,
        "eps": 1.65,
        "equity": 63.484,
        "shares": 93389,
        "dps": 1,
        "per": 309,
        "netIncome": 154
      },
      {
        "year": 2024,
        "eps": "",
        "equity": "",
        "shares": 93389,
        "dps": "",
        "per": "",
        "netIncome": ""
      }
    ]
  },
  "PMMP": {
    "ticker": "PMMP",
    "price": 160,
    "rows": [
      {
        "year": 2020,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2021,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2022,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2023,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2024,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      }
    ]
  },
  "AADI": {
    "ticker": "AADI",
    "price": 8900,
    "rows": [
      {
        "year": 2020,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2021,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2022,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2023,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2024,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      }
    ]
  },
  "BUMI": {
    "ticker": "BUMI",
    "price": 140,
    "rows": [
      {
        "year": 2020,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2021,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2022,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2023,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2024,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      }
    ]
  },
  "SMDR": {
    "ticker": "SMDR",
    "price": 340,
    "rows": [
      {
        "year": 2020,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2021,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2022,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2023,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2024,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      }
    ]
  },
  "CDIA": {
    "ticker": "CDIA",
    "price": 1950,
    "rows": [
      {
        "year": 2020,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2021,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2022,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2023,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2024,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      }
    ]
  },
  "RAJA": {
    "ticker": "RAJA",
    "price": 1350,
    "rows": [
      {
        "year": 2020,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2021,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2022,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2023,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2024,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      }
    ]
  },
  "ADMR": {
    "ticker": "ADMR",
    "price": 1420,
    "rows": [
      {
        "year": 2020,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2021,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2022,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2023,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2024,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      }
    ]
  },
  "DEWA": {
    "ticker": "DEWA",
    "price": 105,
    "rows": [
      {
        "year": 2020,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2021,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2022,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2023,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2024,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      }
    ]
  },
  "PTRO": {
    "ticker": "PTRO",
    "price": 14500,
    "rows": [
      {
        "year": 2020,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2021,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2022,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2023,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2024,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      }
    ]
  },
  "MBMA": {
    "ticker": "MBMA",
    "price": 540,
    "rows": [
      {
        "year": 2020,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2021,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2022,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2023,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2024,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      }
    ]
  },
  "WIFI": {
    "ticker": "WIFI",
    "price": 280,
    "rows": [
      {
        "year": 2020,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2021,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2022,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2023,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2024,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      }
    ]
  },
  "ARCI": {
    "ticker": "ARCI",
    "price": 330,
    "rows": [
      {
        "year": 2020,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2021,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2022,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2023,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2024,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      }
    ]
  },
  "PRDL": {
    "ticker": "PRDL",
    "price": 180,
    "rows": [
      {
        "year": 2020,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2021,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2022,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2023,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2024,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      }
    ]
  },
  "GMFI": {
    "ticker": "GMFI",
    "price": 65,
    "rows": [
      {
        "year": 2020,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2021,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2022,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2023,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      },
      {
        "year": 2024,
        "eps": "",
        "equity": "",
        "shares": "",
        "dps": "",
        "per": "",
        "netIncome": ""
      }
    ]
  },
  "ASII": {
    "ticker": "ASII",
    "price": 5100,
    "rows": [
      {
        "year": 2020,
        "eps": 399,
        "equity": 195454,
        "shares": 40483,
        "dps": 114,
        "per": 15.1,
        "netIncome": 16164
      },
      {
        "year": 2021,
        "eps": 499,
        "equity": 214580,
        "shares": 40483,
        "dps": 194,
        "per": 11.4,
        "netIncome": 20196
      },
      {
        "year": 2022,
        "eps": 715,
        "equity": 242630,
        "shares": 40483,
        "dps": 552,
        "per": 8,
        "netIncome": 28944
      },
      {
        "year": 2023,
        "eps": 836,
        "equity": 250550,
        "shares": 40483,
        "dps": 510,
        "per": 6.8,
        "netIncome": 33839
      },
      {
        "year": 2024,
        "eps": 855,
        "equity": 268900,
        "shares": 40483,
        "dps": 520,
        "per": 6,
        "netIncome": 34600
      }
    ]
  },
  "TLKM": {
    "ticker": "TLKM",
    "price": 2950,
    "rows": [
      {
        "year": 2020,
        "eps": 210,
        "equity": 120889,
        "shares": 99062,
        "dps": 168,
        "per": 15.8,
        "netIncome": 20804
      },
      {
        "year": 2021,
        "eps": 249,
        "equity": 145661,
        "shares": 99062,
        "dps": 149,
        "per": 16.2,
        "netIncome": 24760
      },
      {
        "year": 2022,
        "eps": 210,
        "equity": 149269,
        "shares": 99062,
        "dps": 167,
        "per": 17.9,
        "netIncome": 20753
      },
      {
        "year": 2023,
        "eps": 248,
        "equity": 156562,
        "shares": 99062,
        "dps": 178,
        "per": 15.9,
        "netIncome": 24560
      },
      {
        "year": 2024,
        "eps": 258,
        "equity": 165400,
        "shares": 99062,
        "dps": 185,
        "per": 11.4,
        "netIncome": 25550
      }
    ]
  }
};

// FIX AUDIT: defaulted to ticker:'BBCA', currentPrice:9850 (a hardcoded,
// long-stale snapshot) — every fresh visit silently computed a real-
// looking BBCA valuation before the user ever typed anything, and typing
// a different ticker could still leave old numbers mixed with the new
// ticker's label if the reload path was skipped (see hw_ensureTickerSynced
// below). Blank default per user request — a valuation with no ticker
// picked should show an empty prompt, not a phantom BBCA calculation.
var hwData = { rows: [], ticker: '', currentPrice: 0, minReturn: 6, projYears: 5 };
var HW_LAST_CONFIRMED_TICKER = null;
window.hwData = hwData;
window.STOCK_FINANCIAL_DATABASE = STOCK_FINANCIAL_DATABASE;
var hwHistChart = null;
var hwChartMode = 'eps';

function hw_switchChart(mode) {
  hwChartMode = mode;
  var btnEps = document.getElementById('hw-chart-btn-eps');
  var btnEq = document.getElementById('hw-chart-btn-eq');
  if (btnEps) {
    if (mode === 'eps') {
      btnEps.style.borderColor = 'rgba(0,0,255,.5)';
      btnEps.style.color = 'var(--accent)';
      btnEps.style.background = 'rgba(0,0,255,.12)';
    } else {
      btnEps.style.borderColor = '';
      btnEps.style.color = '';
      btnEps.style.background = '';
    }
  }
  if (btnEq) {
    if (mode === 'eq') {
      btnEq.style.borderColor = 'rgba(0,212,170,.5)';
      btnEq.style.color = '#00d4aa';
      btnEq.style.background = 'rgba(0,212,170,.12)';
    } else {
      btnEq.style.borderColor = '';
      btnEq.style.color = '';
      btnEq.style.background = '';
    }
  }
  if (hwData && hwData._lastRows) {
    hw_renderChart(hwData._lastRows);
  }
}
window.hw_switchChart = hw_switchChart;

function hw_defaultRows(ticker) {
  var tk = (ticker || hwData.ticker || '').toUpperCase();
  if (STOCK_FINANCIAL_DATABASE[tk] && STOCK_FINANCIAL_DATABASE[tk].rows) {
    return JSON.parse(JSON.stringify(STOCK_FINANCIAL_DATABASE[tk].rows));
  }
  var currentYear = new Date().getFullYear();
  var rows = [];
  for (var i = 4; i >= 0; i--) {
    rows.push({ year: currentYear - i, eps: '', equity: '', shares: '', dps: '', per: '', netIncome: '' });
  }
  return rows;
}

function hw_init() {
  // Only restore a previously SAVED session (real prior user work) — a
  // first-ever visit or a Reset should land on a blank form, not a
  // phantom ticker auto-loaded on the user's behalf.
  var tk = (hwData.ticker || '').toUpperCase();
  try {
    var saved = localStorage.getItem('hw_state');
    if (saved) {
      var s = JSON.parse(saved);
      if (s && Array.isArray(s.rows) && s.rows.length > 0 && s.ticker) {
        hwData = s;
        HW_LAST_CONFIRMED_TICKER = hwData.ticker;
      } else if (tk) {
        hw_loadStockData(tk);
        HW_LAST_CONFIRMED_TICKER = tk;
      }
    } else if (tk) {
      hw_loadStockData(tk);
      HW_LAST_CONFIRMED_TICKER = tk;
    }
  } catch(e) {
    if (tk) { hw_loadStockData(tk); HW_LAST_CONFIRMED_TICKER = tk; }
  }

  // Ensure current price is filled if missing
  if (!hwData.currentPrice || hwData.currentPrice <= 0) {
    if (STOCK_FINANCIAL_DATABASE[hwData.ticker]) {
      hwData.currentPrice = STOCK_FINANCIAL_DATABASE[hwData.ticker].price;
    }
  }

  hw_renderTable();
  hw_renderHistoryList();
  if (!hwData.ticker) { hw_clearResults(); return; }
  setTimeout(function() {
    hw_recalc();
  }, 50);
}
window.hw_init = hw_init;
window.hw_renderTable = hw_renderTable;


function hw_loadStockData(tk) {
  tk = (tk || '').toUpperCase();
  if (!tk) { hwData.ticker = ''; hwData.rows = []; hwData.currentPrice = 0; return; }
  hwData.ticker = tk;
  
  // Resolve price from SSOT first (ensures 100% uniformity across all modules)
  var marketPrice = typeof getGlobalMarketPrice === 'function' ? getGlobalMarketPrice(tk) : 0;
  
  if (STOCK_FINANCIAL_DATABASE[tk]) {
    hwData.currentPrice = marketPrice > 0 ? marketPrice : STOCK_FINANCIAL_DATABASE[tk].price;
    hwData.rows = JSON.parse(JSON.stringify(STOCK_FINANCIAL_DATABASE[tk].rows));
  } else if (typeof isValidStockTicker === 'function' && !isValidStockTicker(tk)) {
    hwData.currentPrice = 0;
    hwData.rows = [];
  } else {
    // No real historical financials for this ticker (only 27 tickers have
    // a hand-entered STOCK_FINANCIAL_DATABASE entry). This used to
    // fabricate 5 years of "historical" EPS/Equity/DPS/Net Income from a
    // formula (curPrice/12, a flat 15x PER, a 0.94^i decay curve) that
    // had nothing to do with the company's real financials - for every
    // one of the hundreds of other IDX tickers, silently. Real current
    // price is still looked up, but the historical table is left honestly
    // empty (matching hw_defaultRows) for the user to fill in themselves.
    var univ = (typeof FS_UNIV !== 'undefined') ? FS_UNIV.find(function(u){ return u.t === tk; }) : null;
    var curPrice = marketPrice > 0 ? marketPrice : (univ && univ.price > 0 ? univ.price : (typeof DB !== 'undefined' && DB[tk] ? DB[tk].base : 0));
    hwData.currentPrice = curPrice;
    hwData.rows = hw_defaultRows(tk);
  }
}

function hw_loadStock(tk) {
  if (!tk) return;
  tk = tk.trim().toUpperCase();
  hw_loadStockData(tk);
  hw_renderTable();
  hw_recalc();
  if (typeof showSaveStatus === 'function') {
    showSaveStatus('Data riil ' + tk + ' dimuat (Harga: Rp ' + (hwData.currentPrice||0).toLocaleString('id-ID') + ')', 'var(--green)');
  }
}
window.hw_loadStock = hw_loadStock;

function hw_renderTable() {
  var tbody = document.getElementById('hw-data-body');
  if (!tbody) return;
  if (!hwData.rows || !hwData.rows.length) hwData.rows = hw_defaultRows(hwData.ticker);
  
  tbody.innerHTML = '';
  var inpStyle = 'background:var(--bg3);border:1px solid var(--border);color:var(--text);font-family:"Menlo",monospace;font-size:11px;padding:3px 5px;border-radius:1px;box-sizing:border-box;width:100%';
  var placeholders = {year:'e.g. 2024',eps:'e.g. 350',equity:'e.g. 150537',shares:'e.g. 99062',dps:'e.g. 168',per:'e.g. 16.5',netIncome:'e.g. 33948'};
  var widths = {year:'70px',eps:'100px',equity:'130px',shares:'120px',dps:'100px',per:'80px',netIncome:'130px'};

  function hw_cellWarn(field, val) {
    if (!val || val === '') return false;
    var v = parseFloat(val);
    if (isNaN(v)) return true;
    if (field === 'shares' && v < 100) return true;
    if (field === 'equity' && v < 1) return true;
    if (field === 'netIncome' && v < 0) return true;
    if (field === 'per' && (v < 1 || v > 150)) return true;
    if (field === 'eps' && v <= 0) return true;
    return false;
  }

  hwData.rows.forEach(function(row, i) {
    var tr = document.createElement('tr');
    var allFields = ['year','eps','equity','shares','dps','per','netIncome'];
    allFields.forEach(function(field) {
      var td = document.createElement('td');
      var inp = document.createElement('input');
      inp.type = 'number';
      var v = (row[field] !== '' && row[field] !== undefined && row[field] !== null) ? row[field] : '';
      inp.value = v;
      inp.placeholder = placeholders[field] || '';
      inp.setAttribute('style', inpStyle);
      inp.style.width = widths[field] || '80px';
      if (hw_cellWarn(field, v)) {
        inp.style.borderColor = 'var(--amber)';
        inp.style.background = 'rgba(255,187,0,.08)';
        inp.title = 'Periksa unit: ' + ({shares:'Juta lembar',equity:'Miliar Rp',per:'Antara 1–150x',eps:'Harus positif',netIncome:'Miliar Rp'}[field] || '');
      }
      inp.setAttribute('data-hw-row', String(i));
      inp.setAttribute('data-hw-field', field);
      td.appendChild(inp);
      tr.appendChild(td);
    });
    var tdDel = document.createElement('td');
    var btnDel = document.createElement('button');
    btnDel.textContent = '×';
    btnDel.setAttribute('style','background:none;border:none;color:var(--red);cursor:pointer;font-size:14px;padding:0 6px');
    btnDel.onclick = (function(idx){ return function(){ hw_removeRow(idx); }; })(i);
    tdDel.appendChild(btnDel);
    tr.appendChild(tdDel);
    tbody.appendChild(tr);
  });

  var cp = document.getElementById('hw-current-price');
  if (cp) cp.value = hwData.currentPrice || '';
  var mr = document.getElementById('hw-min-return');
  if (mr) mr.value = hwData.minReturn || 6;
  var py = document.getElementById('hw-proj-years');
  if (py) py.value = hwData.projYears || 5;
  var ti = document.getElementById('hw-ticker-input');
  if (ti) ti.value = hwData.ticker || '';
}

// Both of these re-render the whole table straight from hwData.rows.
// hwData.rows is only ever refreshed from the actual <input> values
// inside hw_syncInputs(), which used to run only when "HITUNG" was
// clicked - so editing a cell (e.g. retyping a year) and then clicking
// "+ Tambah Tahun" or the row's "x" button read/rendered from stale
// in-memory data, silently discarding whatever the user had just typed.
// That's the "tidak bisa ditambah tahun" bug: it looked like the new
// row (or the edit that was supposed to be there) never stuck.
function hw_addYear() {
  hw_syncInputs();
  var lastYear = hwData.rows.length ? hwData.rows[hwData.rows.length-1].year : new Date().getFullYear()-1;
  hwData.rows.push({ year: lastYear+1, eps:'', equity:'', shares:'', dps:'', per:'', netIncome:'' });
  hw_renderTable();
}
window.hw_addYear = hw_addYear;

function hw_removeRow(i) {
  hw_syncInputs();
  hwData.rows.splice(i, 1);
  hw_renderTable();
  hw_clearResults();
}
window.hw_removeRow = hw_removeRow;

function hw_resetAll() {
  try { localStorage.removeItem('hw_state'); } catch(e) {}
  hwData = { rows: [], ticker: '', currentPrice: 0, minReturn: 6, projYears: 5 };
  HW_LAST_CONFIRMED_TICKER = null;
  var ti = document.getElementById('hw-ticker-input'); if (ti) ti.value = '';
  var cp = document.getElementById('hw-current-price'); if (cp) cp.value = '';
  hw_renderTable();
  hw_clearResults();
}
window.hw_resetAll = hw_resetAll;

function hw_onTickerChange() {
  var ti = document.getElementById('hw-ticker-input');
  var tk = ti ? ti.value.trim().toUpperCase() : '';
  if (!tk) return;

  // hw_recalc() runs hw_ensureTickerSynced() first, which loads real data
  // for a curated ticker or blanks the table for an uncurated one — so
  // the table on screen matches the ticker the moment you tab out of the
  // field, instead of only correcting itself on the next HITUNG click.
  hw_recalc();

  if (typeof rdFetchLivePrice === 'function') {
    var priceBadge = document.getElementById('hw-verdict-badge');
    var prevBadgeText = priceBadge ? priceBadge.textContent : null;
    if (priceBadge) { priceBadge.textContent = '⏳ Memuat harga real...'; priceBadge.style.background = 'var(--bg4)'; priceBadge.style.color = 'var(--text3)'; priceBadge.style.borderColor = 'var(--border)'; }
    rdFetchLivePrice(tk, function(err, price){
      if (!err && price && price > 0 && hwData.ticker === tk) {
        hwData.currentPrice = price;
        var cp = document.getElementById('hw-current-price');
        if (cp) cp.value = price;
        hw_recalc();
      } else if (priceBadge && prevBadgeText) {
        priceBadge.textContent = prevBadgeText;
      }
    });
  }
}
window.hw_onTickerChange = hw_onTickerChange;

function hw_autoFill() {
  var ti = document.getElementById('hw-ticker-input');
  var tk = (ti ? ti.value : hwData.ticker || '').trim().toUpperCase();
  if (!tk) {
    if (typeof showSaveStatus === 'function') showSaveStatus('Isi kode saham dulu sebelum Auto-Fill', 'var(--amber)');
    return;
  }

  hw_loadStockData(tk);
  HW_LAST_CONFIRMED_TICKER = tk;
  hw_renderTable();

  if (typeof rdFetchLivePrice === 'function') {
    rdFetchLivePrice(tk, function(err, price){
      if (!err && price && price > 0) {
        hwData.currentPrice = price;
        var cp = document.getElementById('hw-current-price');
        if (cp) cp.value = price;
      }
      hw_recalc();
      if (typeof showSaveStatus === 'function') {
        showSaveStatus('Data riil & harga terkini ' + tk + ' berhasil dimuat!', 'var(--green)');
      }
    });
  } else {
    hw_recalc();
  }
}
window.hw_autoFill = hw_autoFill;

function hw_syncInputs() {
  hwData.ticker = ((document.getElementById('hw-ticker-input')||{}).value || hwData.ticker || '').toUpperCase();
  hwData.currentPrice = parseFloat((document.getElementById('hw-current-price')||{}).value) || hwData.currentPrice || 0;
  hwData.minReturn = parseFloat((document.getElementById('hw-min-return')||{}).value) || 6;
  hwData.projYears = parseInt((document.getElementById('hw-proj-years')||{}).value) || 5;

  var fields = ['year','eps','equity','shares','dps','per','netIncome'];
  var trows = document.querySelectorAll('#hw-data-body tr');
  trows.forEach(function(tr, ri) {
    if (!hwData.rows[ri]) return;
    var inputs = tr.querySelectorAll('input[type="number"]');
    inputs.forEach(function(inp, ci) {
      if (ci < fields.length) {
        var val = parseFloat(inp.value);
        hwData.rows[ri][fields[ci]] = isNaN(val) ? '' : val;
      }
    });
  });
}

// FIX AUDIT (root cause of the anomalies reported): the HITUNG button and
// Enter-to-recalc paths called hw_syncInputs()+the valuation math directly
// on whatever was already sitting in the financial-data table's <input>
// fields — they never checked whether that table actually belonged to the
// ticker just typed. Switching from GGRM to a ticker with no curated data
// (or retyping quickly) left GGRM's real numbers in the table, which then
// got computed and displayed under the NEW ticker's name/price — the
// consolidated view showed a confident OVERVALUED/UNDERVALUED verdict
// built from a different company's financials entirely. This guard runs
// first, before any calculation, and makes sure the on-screen table
// actually matches the currently-typed ticker before proceeding.
function hw_ensureTickerSynced() {
  var ti = document.getElementById('hw-ticker-input');
  var tk = ti ? ti.value.trim().toUpperCase() : '';

  if (!tk) {
    hwData.ticker = '';
    hwData.rows = [];
    HW_LAST_CONFIRMED_TICKER = null;
    return 'blank';
  }
  if (tk === HW_LAST_CONFIRMED_TICKER) return 'same';

  hwData.ticker = tk;
  if (STOCK_FINANCIAL_DATABASE[tk]) {
    hw_loadStockData(tk);
    hw_renderTable();
    HW_LAST_CONFIRMED_TICKER = tk;
    return 'loaded-real';
  }

  // No curated real financials for this ticker — reset the table to
  // blank rather than silently keep whatever the PREVIOUS ticker's
  // numbers were. The current-price lookup below is real (live cache /
  // universe price), only the historical financial statement rows are
  // left for the user to fill in themselves.
  hwData.rows = hw_defaultRows(tk);
  var marketPrice = typeof getGlobalMarketPrice === 'function' ? getGlobalMarketPrice(tk) : 0;
  var univ = (typeof FS_UNIV !== 'undefined') ? FS_UNIV.find(function(u){ return u.t === tk; }) : null;
  hwData.currentPrice = marketPrice > 0 ? marketPrice : (univ && univ.price > 0 ? univ.price : 0);
  var cp = document.getElementById('hw-current-price');
  if (cp) cp.value = hwData.currentPrice || '';
  hw_renderTable();
  HW_LAST_CONFIRMED_TICKER = tk;
  return 'blank-reset';
}
window.hw_ensureTickerSynced = hw_ensureTickerSynced;

function hw_recalc() {
  var tickerSyncState = hw_ensureTickerSynced();
  hw_syncInputs();

  var btn = document.getElementById('hw-hitung-btn');
  if (btn) { btn.textContent = '⏳ Menghitung...'; btn.style.opacity = '.7'; btn.disabled = true; }

  function done() { if (btn) { btn.textContent = '⚡ HITUNG'; btn.style.opacity = '1'; btn.disabled = false; } }

  function fmt(n) { return (n === null || n === undefined || isNaN(n)) ? '—' : Math.round(n).toLocaleString('id-ID'); }
  function fmtD(n, dec) { return (n === null || n === undefined || isNaN(n)) ? '—' : n.toFixed(dec !== undefined ? dec : 1); }
  function fmtPct(n) { if (n === null || n === undefined || isNaN(n)) return '—'; return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function fmtRp(n) { return 'Rp ' + fmt(n); }

  // Fallback for currentPrice if 0 or empty
  if (!hwData.currentPrice || hwData.currentPrice <= 0) {
    var dbEntry = STOCK_FINANCIAL_DATABASE[hwData.ticker];
    if (dbEntry && dbEntry.price) {
      hwData.currentPrice = dbEntry.price;
      var cp = document.getElementById('hw-current-price');
      if (cp) cp.value = hwData.currentPrice;
    }
  }

  // Filter valid rows
  var rows = (hwData.rows || []).filter(function(r) {
    return parseFloat(r.eps) > 0 && parseFloat(r.equity) > 0 && parseFloat(r.shares) > 0;
  });

  if (rows.length < 2) {
    // Load default stock data if rows were empty. FIX: this used to
    // reassign `rows = hwData.rows` (the raw, UNfiltered reloaded rows)
    // instead of re-running the same eps/equity/shares > 0 filter — so a
    // curated ticker whose STOCK_FINANCIAL_DATABASE entry is itself just
    // an empty stub (year rows with blank fields, no numbers ever filled
    // in — e.g. RAJA) still counted as "5 valid rows" by length alone.
    // The calculation then ran on NaN eps/equity/shares all the way
    // through, producing garbage like "Fair Value: Rp —" and "Margin of
    // Safety -Infinity%" while still rendering a confident OVERVALUED
    // verdict box instead of the honest "data belum lengkap" notice.
    if (STOCK_FINANCIAL_DATABASE[hwData.ticker]) {
      hwData.rows = JSON.parse(JSON.stringify(STOCK_FINANCIAL_DATABASE[hwData.ticker].rows));
      hw_renderTable();
      rows = hwData.rows.filter(function(r) {
        return parseFloat(r.eps) > 0 && parseFloat(r.equity) > 0 && parseFloat(r.shares) > 0;
      });
    }
  }

  var errors = [];
  if (!hwData.ticker) errors.push('Kode saham belum diisi');
  if (!hwData.currentPrice || hwData.currentPrice <= 0) errors.push('Harga saham saat ini belum diisi');
  if (rows.length < 2) errors.push('Minimal 2 baris data lengkap (EPS, Total Equity, Shares)');

  if (errors.length) {
    hw_clearResults();
    var badge = document.getElementById('hw-verdict-badge');
    if (badge) { badge.textContent = '⚠️ DATA TIDAK LENGKAP'; badge.style.background = 'rgba(255,187,0,.12)'; badge.style.color = 'var(--amber)'; badge.style.borderColor = 'rgba(255,187,0,.3)'; }
    var cEl = document.getElementById('hw-conclusion'); var cTx = document.getElementById('hw-conclusion-text');
    if (cEl && cTx) { cEl.style.display = 'block'; cEl.style.borderLeftColor = 'var(--amber)'; cTx.innerHTML = '<b style="color:var(--amber)">Lengkapi data berikut:</b><br>' + errors.map(function(e){ return '• ' + e; }).join('<br>'); }
    done(); return;
  }

  rows = rows.slice().sort(function(a, b) { return a.year - b.year; });
  var latest = rows[rows.length - 1];
  var ticker = hwData.ticker.toUpperCase();
  var price0 = hwData.currentPrice;
  var minRet = hwData.minReturn || 6;
  var N = hwData.projYears || 5;
  var reqReturn = minRet / 100;

  // === Step 1: Initial IRR = EPS_latest / Price ===
  var eps0 = parseFloat(latest.eps);
  var irr = eps0 / price0;
  var irrPass = (irr * 100) >= minRet;

  // === Step 2a: Average ROE ===
  var roeList = [];
  rows.forEach(function(r) {
    var eq = parseFloat(r.equity);
    if (!(eq > 0)) return;
    var ni = parseFloat(r.netIncome);
    if (!(ni > 0)) {
      var e = parseFloat(r.eps), s = parseFloat(r.shares);
      if (e > 0 && s > 0) ni = (e * s) / 1000;
      else return;
    }
    var roe = ni / eq;
    if (roe > 0 && roe < 2) roeList.push(roe);
  });
  var avgROE = roeList.length ? roeList.reduce(function(s,v){return s+v;},0) / roeList.length : 0.15;

  // === Step 2b: Average DPR = DPS / EPS ===
  var dprWarning = false;
  var dprList = [];
  rows.forEach(function(r) {
    var e = parseFloat(r.eps);
    if (!(e > 0)) return;
    var d = parseFloat(r.dps);
    if (isNaN(d) || d < 0) d = 0;
    var v = d / e;
    if (v > 1.0) { dprWarning = true; v = 1.0; }
    dprList.push(v);
  });
  var avgDPR = dprList.length ? dprList.reduce(function(s,v){return s+v;},0) / dprList.length : 0.35;

  // === Step 2c: ROE after payout ===
  var roeAfterPayout = avgROE * (1 - avgDPR);

  // === Step 3a: Equity per Share (Rp/saham) ===
  var equityMiliar = parseFloat(latest.equity);
  var sharesJuta = parseFloat(latest.shares);
  var equityPerShare = (equityMiliar * 1e9) / (sharesJuta * 1e6);

  // === Step 3b: Future Equity per Share ===
  var futureEquityPerShare = equityPerShare * Math.pow(1 + Math.max(roeAfterPayout, -0.5), N);

  // === Step 4: Future EPS ===
  var futureEPS = futureEquityPerShare * avgROE;

  // === Step 5: Average PER ===
  var perList = [];
  rows.forEach(function(r) {
    var p = parseFloat(r.per);
    if (p > 0 && p < 200) perList.push(p);
  });
  var avgPER = perList.length ? perList.reduce(function(s,v){return s+v;},0) / perList.length : 15.0;

  // Future Stock Price (conservative)
  var latestPer = parseFloat(latest.per) || avgPER;
  var exitPER = Math.min(avgPER, latestPer > 0 ? latestPer : avgPER);
  var futurePrice = futureEPS * exitPER;

  // === Future Price + Dividends (9-Step MoS Formula) ===
  var totalDividends = 0;
  for (var k = 1; k <= N; k++) {
    var projectedEq = equityPerShare * Math.pow(1 + roeAfterPayout, k);
    var projectedEps = projectedEq * avgROE;
    totalDividends += (projectedEps * avgDPR);
  }
  var futurePriceWithDiv = futurePrice + totalDividends;

  // === Step 7: Expected Rate of Return ROE ===
  var expRoeReturn = (futurePriceWithDiv > 0 && price0 > 0) ? Math.pow(futurePriceWithDiv / price0, 1 / N) - 1 : 0;

  // === Step 8: Fair Value (Harga Wajar) ===
  var fairValue = (futurePriceWithDiv > 0) ? futurePriceWithDiv / Math.pow(1 + reqReturn, N) : (futurePrice / Math.pow(1 + reqReturn, N));

  // === Step 9: Margin of Safety ===
  var mosPct = fairValue > 0 ? (fairValue - price0) / fairValue * 100 : -Infinity;
  var mosPass = isFinite(mosPct) && mosPct > 0;
  var overallPass = irrPass && mosPass;

  // === Render Verdict & Badges ===
  var elTkDisp = document.getElementById('hw-ticker-display');
  if (elTkDisp) elTkDisp.textContent = ticker;
  var badge = document.getElementById('hw-verdict-badge');
  var verdCard = document.getElementById('hw-verdict-card');
  if (badge) {
    if (overallPass) {
      badge.textContent = '✅ UNDERVALUED — LAYAK BELI';
      badge.style.background = 'rgba(0,212,170,.15)';
      badge.style.color = 'var(--green)';
      badge.style.borderColor = 'rgba(0,212,170,.4)';
      if (verdCard) verdCard.style.borderTopColor = 'var(--green)';
    } else if (!irrPass && !mosPass) {
      badge.textContent = '🚫 OVERVALUED — HINDARI';
      badge.style.background = 'rgba(255,34,68,.12)';
      badge.style.color = 'var(--red)';
      badge.style.borderColor = 'rgba(255,34,68,.3)';
      if (verdCard) verdCard.style.borderTopColor = 'var(--red)';
    } else {
      badge.textContent = '⚠️ PERHATIKAN — BORDERLINE';
      badge.style.background = 'rgba(255,187,0,.12)';
      badge.style.color = 'var(--amber)';
      badge.style.borderColor = 'rgba(255,187,0,.3)';
      if (verdCard) verdCard.style.borderTopColor = 'var(--amber)';
    }
  }

  // === Render Numbers ===
  var mosPctDisplay = isFinite(mosPct) ? fmtPct(mosPct) : (mosPct === -Infinity ? '−∞' : '∞');
  var elFairPrice = document.getElementById('hw-fair-price');
  if (elFairPrice) {
    elFairPrice.textContent = fmtRp(fairValue);
    elFairPrice.style.color = mosPass ? 'var(--green)' : 'var(--red)';
  }
  var elCurDisp = document.getElementById('hw-current-display');
  if (elCurDisp) elCurDisp.textContent = fmtRp(price0);

  var elMosPct = document.getElementById('hw-mos-pct');
  if (elMosPct) {
    elMosPct.textContent = mosPctDisplay;
    elMosPct.style.color = (isFinite(mosPct) && mosPct > 30) ? 'var(--green)' : (isFinite(mosPct) && mosPct > 0) ? 'var(--amber)' : 'var(--red)';
  }

  var elIrrDisp = document.getElementById('hw-irr-display');
  if (elIrrDisp) {
    elIrrDisp.textContent = fmtPct(irr * 100);
    elIrrDisp.style.color = irrPass ? 'var(--green)' : 'var(--red)';
  }

  var gaugeVal = isFinite(mosPct) ? Math.min(Math.max((mosPct + 100) / 200 * 100, 0), 100) : (mosPct === -Infinity ? 0 : 100);
  var elMosBar = document.getElementById('hw-mos-bar');
  if (elMosBar) {
    elMosBar.style.width = gaugeVal + '%';
    elMosBar.style.background = mosPass ? 'var(--green)' : 'var(--red)';
  }
  var elMosLabel = document.getElementById('hw-mos-label');
  if (elMosLabel) {
    elMosLabel.textContent = mosPctDisplay;
    elMosLabel.style.color = mosPass ? 'var(--green)' : 'var(--red)';
  }

  // Metrics panel
  var elV_roe = document.getElementById('hw-v-roe'); if (elV_roe) elV_roe.textContent = fmtPct(avgROE * 100);
  var elV_dpr = document.getElementById('hw-v-dpr'); if (elV_dpr) elV_dpr.textContent = fmtPct(avgDPR * 100);
  var elV_per = document.getElementById('hw-v-per'); if (elV_per) elV_per.textContent = fmtD(avgPER, 1) + 'x';
  var elV_eps = document.getElementById('hw-v-eps'); if (elV_eps) elV_eps.textContent = fmtRp(eps0);
  var elV_eq = document.getElementById('hw-v-eq'); if (elV_eq) elV_eq.textContent = fmtRp(equityPerShare);
  var elV_feps = document.getElementById('hw-v-feps'); if (elV_feps) elV_feps.textContent = fmtRp(futureEPS);
  var elV_fsp = document.getElementById('hw-v-fsp'); if (elV_fsp) elV_fsp.textContent = fmtRp(futurePriceWithDiv);
  var elV_roe2 = document.getElementById('hw-v-roe2'); if (elV_roe2) elV_roe2.textContent = fmtPct(roeAfterPayout * 100);

  // === Multi-Model Valuation Calculations ===
  var grahamVal = (eps0 > 0 && equityPerShare > 0) ? Math.sqrt(22.5 * eps0 * equityPerShare) : 0;
  var grahamMos = (grahamVal > 0 && price0 > 0) ? (grahamVal - price0) / grahamVal * 100 : 0;

  var epsGrowthPct = Math.max(roeAfterPayout * 100, 5);
  var lynchVal = (eps0 > 0) ? eps0 * Math.min(epsGrowthPct, 35) : 0;
  var lynchMos = (lynchVal > 0 && price0 > 0) ? (lynchVal - price0) / lynchVal * 100 : 0;

  var dps0 = parseFloat(latest.dps) || (eps0 * avgDPR);
  var g = Math.min(Math.max(roeAfterPayout, 0.02), reqReturn - 0.015);
  var ddmVal = (dps0 > 0 && reqReturn > g) ? (dps0 * (1 + g)) / (reqReturn - g) : 0;
  var ddmMos = (ddmVal > 0 && price0 > 0) ? (ddmVal - price0) / ddmVal * 100 : 0;

  var elMm_mosVal = document.getElementById('hw-mm-mos-val');
  var elMm_mosPct = document.getElementById('hw-mm-mos-pct');
  if (elMm_mosVal) elMm_mosVal.textContent = fmtRp(fairValue);
  if (elMm_mosPct) {
    elMm_mosPct.textContent = (mosPct >= 0 ? '+' : '') + fmtPct(mosPct) + ' MoS';
    elMm_mosPct.style.color = mosPass ? 'var(--green)' : 'var(--red)';
  }

  var elGrahamVal = document.getElementById('hw-mm-graham-val');
  var elGrahamPct = document.getElementById('hw-mm-graham-pct');
  if (elGrahamVal) elGrahamVal.textContent = grahamVal > 0 ? fmtRp(grahamVal) : 'N/A';
  if (elGrahamPct) {
    elGrahamPct.textContent = grahamVal > 0 ? (grahamMos >= 0 ? '+' : '') + fmtPct(grahamMos) + ' MoS' : 'EPS/BVPS < 0';
    elGrahamPct.style.color = grahamMos > 0 ? 'var(--green)' : 'var(--red)';
  }

  var elLynchVal = document.getElementById('hw-mm-lynch-val');
  var elLynchPct = document.getElementById('hw-mm-lynch-pct');
  if (elLynchVal) elLynchVal.textContent = lynchVal > 0 ? fmtRp(lynchVal) : 'N/A';
  if (elLynchPct) {
    elLynchPct.textContent = lynchVal > 0 ? (lynchMos >= 0 ? '+' : '') + fmtPct(lynchMos) + ' MoS' : 'EPS < 0';
    elLynchPct.style.color = lynchMos > 0 ? 'var(--green)' : 'var(--red)';
  }

  var elDdmVal = document.getElementById('hw-mm-ddm-val');
  var elDdmPct = document.getElementById('hw-mm-ddm-pct');
  if (elDdmVal) elDdmVal.textContent = ddmVal > 0 ? fmtRp(ddmVal) : 'N/A (No Div)';
  if (elDdmPct) {
    elDdmPct.textContent = ddmVal > 0 ? (ddmMos >= 0 ? '+' : '') + fmtPct(ddmMos) + ' MoS' : 'Tidak bagi dividen';
    elDdmPct.style.color = ddmMos > 0 ? 'var(--green)' : 'var(--text3)';
  }

  // === 2D Sensitivity Matrix Rendering ===
  var smTbody = document.getElementById('hw-sm-tbody');
  if (smTbody && equityPerShare > 0) {
    var roeLevels = [
      { label: 'Bear (-25%)', roe: avgROE * 0.75 },
      { label: 'Base (Normal)', roe: avgROE },
      { label: 'Bull (+25%)', roe: avgROE * 1.25 }
    ];
    var perLevels = [
      { label: 'Bear (' + fmtD(avgPER * 0.75, 1) + 'x)', per: avgPER * 0.75 },
      { label: 'Base (' + fmtD(avgPER, 1) + 'x)', per: avgPER },
      { label: 'Bull (' + fmtD(avgPER * 1.25, 1) + 'x)', per: avgPER * 1.25 }
    ];

    var col1 = document.getElementById('hw-sm-col-1');
    var col2 = document.getElementById('hw-sm-col-2');
    var col3 = document.getElementById('hw-sm-col-3');
    if (col1) col1.textContent = perLevels[0].label;
    if (col2) col2.textContent = perLevels[1].label;
    if (col3) col3.textContent = perLevels[2].label;

    smTbody.innerHTML = roeLevels.map(function(rRow, rIdx) {
      var rAfter = rRow.roe * (1 - avgDPR);
      var futEq = equityPerShare * Math.pow(1 + Math.max(rAfter, -0.99), N);
      var futEps = futEq * rRow.roe;

      var cells = perLevels.map(function(pCol, pIdx) {
        var futP = futEps * pCol.per;
        var fv = futP / Math.pow(1 + reqReturn, N);
        var mos = fv > 0 ? ((fv - price0) / fv * 100) : -100;
        var isCenter = (rIdx === 1 && pIdx === 1);
        var colStyle = mos > 20 ? 'color:var(--green)' : mos > 0 ? 'color:var(--amber)' : 'color:var(--red)';
        var bgStyle = isCenter ? 'background:rgba(47,106,243,.12);border:1px solid rgba(47,106,243,.3);border-radius:3px;' : '';
        return '<td style="padding:6px 4px;' + bgStyle + '">'
          + '<div style="font-weight:700;font-family:var(--font-mono);font-size:11px;' + colStyle + '">Rp ' + fmt(fv) + '</div>'
          + '<div style="font-size:8px;color:var(--text3)">' + (mos >= 0 ? '+' : '') + mos.toFixed(0) + '% MoS</div>'
          + '</td>';
      }).join('');

      var rowLabelStyle = (rIdx === 1) ? 'font-weight:700;color:var(--accent)' : 'color:var(--text2)';
      return '<tr><td style="text-align:left;font-size:9px;' + rowLabelStyle + '">' + rRow.label + '<br><span style="font-size:8px;color:var(--text3)">ROE ' + fmtPct(rRow.roe * 100) + '</span></td>' + cells + '</tr>';
    }).join('');
  }

  // Steps breakdown
  var stepsCard = document.getElementById('hw-steps-card');
  var stepsBody = document.getElementById('hw-steps-body');
  if (stepsCard && stepsBody) {
    stepsCard.style.display = 'block';
    var steps = [
      { label: 'Step 1 — IRR Awal', val: fmtPct(irr*100) + (irrPass ? ' ✅' : ' ❌'), desc: 'EPS terkini ÷ Harga Saham', ok: irrPass },
      { label: 'Step 2a — Avg ROE', val: fmtPct(avgROE*100), desc: roeList.length + ' tahun data historis real', ok: avgROE > 0 },
      { label: 'Step 2b — Avg DPR', val: fmtPct(avgDPR*100), desc: dprList.length + ' tahun' + (dprWarning ? ' ⚠️ Di-cap 100%' : ''), ok: true },
      { label: 'Step 2c — ROE after Payout', val: fmtPct(roeAfterPayout*100), desc: 'Avg ROE × (1 − Avg DPR)', ok: roeAfterPayout > 0 },
      { label: 'Step 3a — Equity / Share kini', val: fmtRp(equityPerShare), desc: equityMiliar.toLocaleString('id-ID') + 'M ÷ ' + sharesJuta.toLocaleString('id-ID') + 'jt lbr', ok: equityPerShare > 0 },
      { label: 'Step 3b — Future Equity/Share', val: fmtRp(futureEquityPerShare), desc: 'Proyeksi ' + N + ' tahun ke depan', ok: futureEquityPerShare > 0 },
      { label: 'Step 4 — Future EPS', val: fmtRp(futureEPS), desc: 'Future Equity × Avg ROE', ok: futureEPS > 0 },
      { label: 'Step 5 — Exit PER', val: fmtD(exitPER, 1) + 'x', desc: 'Konservatif: Min(Avg PER, Latest PER)', ok: exitPER > 0 },
      { label: 'Step 6 — Future Price + Div', val: fmtRp(futurePriceWithDiv), desc: 'Harga Masa Depan + Akumulasi Dividen ' + N + ' thn', ok: futurePriceWithDiv > 0 },
      { label: 'Step 7 — Exp. Return ROE', val: fmtPct(expRoeReturn*100), desc: 'Tingkat pengembalian tahunan proyeksi', ok: expRoeReturn > 0 },
      { label: 'Step 8 — Harga Wajar (PV)', val: fmtRp(fairValue), desc: 'Discounted ' + N + ' thn @ target ' + minRet + '%/thn', ok: fairValue > 0 },
      { label: 'Step 9 — Margin of Safety', val: mosPctDisplay, desc: mosPass ? 'Saham di bawah nilai wajar (Undervalued)' : 'Saham di atas nilai wajar (Overvalued)', ok: mosPass }
    ];
    stepsBody.innerHTML = steps.map(function(s) {
      return '<div style="background:var(--bg3);border-radius:2px;padding:7px 9px;border-left:2px solid ' + (s.ok ? 'var(--green)' : 'var(--red)') + '">'
        + '<div style="font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">' + s.label + '</div>'
        + '<div style="font-size:13px;font-weight:700;font-family:var(--font-mono);color:var(--text);margin:2px 0">' + s.val + '</div>'
        + '<div style="font-size:9px;color:var(--text3)">' + s.desc + '</div>'
        + '</div>';
    }).join('');
  }

  // Chart
  hw_renderChart(rows);

  // Kesimpulan
  var cEl = document.getElementById('hw-conclusion');
  var cTx = document.getElementById('hw-conclusion-text');
  if (cEl && cTx) {
    var verdictLabel, verdictColor, action;
    if (overallPass) {
      verdictLabel = 'UNDERVALUED'; verdictColor = 'var(--green)';
      action = 'Layak dipertimbangkan untuk diakumulasi/dibeli. Harga saat ini memberikan margin keamanan yang memadai.';
    } else if (!irrPass && !mosPass) {
      verdictLabel = 'OVERVALUED'; verdictColor = 'var(--red)';
      action = 'Tidak disarankan dibeli pada harga saat ini. Tunggu koreksi atau pilih emiten lain dengan MoS positif.';
    } else {
      verdictLabel = 'BORDERLINE / FAIR VALUE'; verdictColor = 'var(--amber)';
      action = 'Posisi valuasi berada di batas wajar. Pertimbangkan potensi dividen dan katalis sektoral.';
    }
    var mosAbs = fairValue - price0;
    var mosAbsStr = isFinite(mosAbs) ? fmtRp(Math.abs(mosAbs)) : '—';
    var lines = [
      ticker + ' dinilai <b style="color:' + verdictColor + '">' + verdictLabel + '</b> berdasarkan metodologi MoS (9-step).',
      'Harga wajar (Fair Value): <b>' + fmtRp(fairValue) + '</b> · Proyeksi ' + N + ' tahun · Min return ' + minRet + '%/thn.',
      'Harga pasar <b>' + fmtRp(price0) + '</b> berada <b>' + (mosAbs >= 0 ? mosAbsStr + ' di bawah' : mosAbsStr + ' di atas') + '</b> nilai wajar → Margin of Safety <b style="color:' + (mosPass ? 'var(--green)' : 'var(--red)') + '">' + mosPctDisplay + '</b>.',
      'Initial IRR <b>' + fmtPct(irr*100) + '</b> vs target ' + minRet + '% → <b style="color:' + (irrPass ? 'var(--green)' : 'var(--red)') + '">' + (irrPass ? 'LULUS' : 'TIDAK LULUS') + '</b>.',
      'Avg ROE: <b>' + fmtPct(avgROE*100) + '</b> · Avg DPR: <b>' + fmtPct(avgDPR*100) + '</b> · Future EPS: <b>' + fmtRp(futureEPS) + '</b> · Future Price + Div: <b>' + fmtRp(futurePriceWithDiv) + '</b>.',
      '<b>→ ' + action + '</b>'
    ];
    cTx.innerHTML = lines.join('<br>');
    cEl.style.display = 'block';
    cEl.style.borderLeftColor = verdictColor;
  }

  // Valuation-based signal (see the honesty note in renderTrafficLightMatrix
  // for why this no longer claims a fake 3-pillar consensus).
  if (typeof renderTrafficLightMatrix === 'function') {
    renderTrafficLightMatrix(ticker, mosPct);
  }

  hwData._result = { fairValue: fairValue, mosPct: mosPct, irr: irr*100, futurePrice: futurePrice, futureEPS: futureEPS, avgROE: avgROE, avgDPR: avgDPR, avgPER: avgPER, roeAfterPayout: roeAfterPayout, equityPerShare: equityPerShare };
  done();
}
window.hw_recalc = hw_recalc;

function hw_renderChart(rows) {
  hwData._lastRows = rows;
  var chartCard = document.getElementById('hw-chart-card');
  if (!chartCard) return;
  chartCard.style.display = 'block';
  var ctx = document.getElementById('hw-history-chart');
  if (!ctx) return;
  if (hwHistChart) { hwHistChart.destroy(); hwHistChart = null; }
  var labels = rows.map(function(r){ return r.year; });
  var tickStyle = { color: '#b8bdd4', font: { size: 9, family: 'Menlo' } };
  var gridStyle = { color: 'rgba(255,255,255,0.06)' };
  var legendOpts = { labels: { color: '#b8bdd4', font: { family: 'Menlo', size: 9 }, boxWidth: 10, padding: 10 } };

  var datasets, scales;
  if (hwChartMode === 'eps') {
    var epsData = rows.map(function(r){ return parseFloat(r.eps)||null; });
    var perData = rows.map(function(r){ return parseFloat(r.per)||null; });
    datasets = [
      { label: 'EPS (Rp)', data: epsData, backgroundColor: 'rgba(0,200,5,.55)', borderColor: 'rgba(0,200,5,.8)', borderWidth: 1, yAxisID: 'y', borderRadius: 2 },
      { label: 'PER (x)', data: perData, type: 'line', borderColor: '#0088ff', backgroundColor: 'transparent', yAxisID: 'y2', tension: .35, pointRadius: 4, pointBackgroundColor: '#0088ff', pointBorderColor: '#0a0a0f', pointBorderWidth: 1.5, borderWidth: 1.5 }
    ];
    scales = {
      x: { ticks: tickStyle, grid: gridStyle },
      y: { position: 'left', ticks: Object.assign({}, tickStyle, { callback: function(v){ return v >= 1000 ? (v/1000).toFixed(1)+'k' : v; } }), grid: gridStyle, title: { display: true, text: 'EPS (Rp)', color: '#00c805', font: { size: 8 } } },
      y2: { position: 'right', ticks: tickStyle, grid: { display: false }, title: { display: true, text: 'PER (x)', color: '#0088ff', font: { size: 8 } } }
    };
  } else {
    var eqData = rows.map(function(r){ return parseFloat(r.equity)||null; });
    var niData = rows.map(function(r){ return parseFloat(r.netIncome)||null; });
    datasets = [
      { label: 'Total Equity (M Rp)', data: eqData, backgroundColor: 'rgba(0,212,170,.45)', borderColor: 'rgba(0,212,170,.8)', borderWidth: 1, yAxisID: 'y', borderRadius: 2 },
      { label: 'Net Income (M Rp)', data: niData, type: 'line', borderColor: '#ffc107', backgroundColor: 'transparent', yAxisID: 'y2', tension: .35, pointRadius: 4, pointBackgroundColor: '#ffc107', pointBorderColor: '#0a0a0f', pointBorderWidth: 1.5, borderWidth: 1.5 }
    ];
    scales = {
      x: { ticks: tickStyle, grid: gridStyle },
      y: { position: 'left', ticks: Object.assign({}, tickStyle, { callback: function(v){ return v >= 1000 ? (v/1000).toFixed(0)+'k' : v; } }), grid: gridStyle, title: { display: true, text: 'Equity (M)', color: '#00d4aa', font: { size: 8 } } },
      y2: { position: 'right', ticks: Object.assign({}, tickStyle, { callback: function(v){ return v >= 1000 ? (v/1000).toFixed(0)+'k' : v; } }), grid: { display: false }, title: { display: true, text: 'Net Inc (M)', color: '#ffc107', font: { size: 8 } } }
    };
  }

  if(typeof Chart !== 'undefined'){
    hwHistChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: {
          legend: legendOpts,
          tooltip: {
            backgroundColor: 'rgba(10,10,20,.92)',
            titleColor: '#0088ff',
            bodyColor: '#c0c0d8',
            borderColor: 'rgba(0,136,255,.3)',
            borderWidth: 1,
            titleFont: { family: 'Menlo', size: 10 },
            bodyFont: { family: 'Menlo', size: 9 },
            callbacks: {
              label: function(ctx) {
                var v = ctx.parsed.y;
                if (v === null) return ctx.dataset.label + ': N/A';
                return ctx.dataset.label + ': ' + (v >= 1000 ? v.toLocaleString('id-ID') : v);
              }
            }
          }
        },
        scales: scales
      }
    });
  }
}

function hw_clearResults() {
  ['hw-fair-price','hw-current-display','hw-mos-pct','hw-irr-display','hw-v-roe','hw-v-dpr','hw-v-per','hw-v-eps','hw-v-eq','hw-v-feps','hw-v-fsp','hw-v-roe2','hw-ticker-display',
   'hw-mm-mos-val','hw-mm-mos-pct','hw-mm-graham-val','hw-mm-graham-pct','hw-mm-lynch-val','hw-mm-lynch-pct','hw-mm-ddm-val','hw-mm-ddm-pct'
  ].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.textContent = '—';
  });
  var badge = document.getElementById('hw-verdict-badge');
  if (badge) { badge.textContent = 'BELUM DIHITUNG'; badge.style.background='var(--bg4)'; badge.style.color='var(--text3)'; badge.style.borderColor='var(--border)'; }
  if (document.getElementById('hw-steps-card')) document.getElementById('hw-steps-card').style.display = 'none';
  if (document.getElementById('hw-chart-card')) document.getElementById('hw-chart-card').style.display = 'none';
  hwChartMode = 'eps'; hwData._lastRows = null;
  if (document.getElementById('hw-mos-bar')) document.getElementById('hw-mos-bar').style.width = '50%';
  if (document.getElementById('hw-conclusion')) document.getElementById('hw-conclusion').style.display = 'none';
  if (document.getElementById('hw-verdict-card')) document.getElementById('hw-verdict-card').style.borderTopColor = 'var(--text3)';
}

function hw_saveToStorage() {
  hw_syncInputs();
  try { localStorage.setItem('hw_state', JSON.stringify(hwData)); } catch(e) {}
  if (hwData.ticker && hwData._result) {
    try {
      var hist = JSON.parse(localStorage.getItem('hw_history')||'[]');
      var r = hwData._result;
      hist.unshift({
        ticker: hwData.ticker,
        date: new Date().toLocaleDateString('id-ID'),
        price: hwData.currentPrice,
        fairValue: r.fairValue,
        mosPct: r.mosPct,
        irr: r.irr
      });
      hist = hist.slice(0, 20);
      localStorage.setItem('hw_history', JSON.stringify(hist));
      hw_renderHistoryList();
      if (typeof showSaveStatus === 'function') showSaveStatus('Analisa disimpan', 'var(--green)');
    } catch(e) {}
  }
}
window.hw_saveToStorage = hw_saveToStorage;

function hw_renderHistoryList() {
  var el = document.getElementById('hw-history-list');
  if (!el) return;
  try {
    var hist = JSON.parse(localStorage.getItem('hw_history')||'[]');
    if (!hist.length) { el.innerHTML = '<div style="font-size:10px;color:var(--text3);text-align:center;padding:16px">Belum ada analisa tersimpan</div>'; return; }
    el.innerHTML = hist.map(function(h) {
      var mos = h.mosPct || 0;
      var col = mos > 20 ? 'var(--green)' : mos > 0 ? 'var(--amber)' : 'var(--red)';
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid var(--border);cursor:pointer" onclick="hw_loadStock(\''+h.ticker+'\')" style="transition:.1s" onmouseover="this.style.background=\'var(--bg3)\'" onmouseout="this.style.background=\'transparent\'">'
        + '<div><span style="font-weight:700;font-family:var(--font-mono);color:var(--accent);font-size:11px">'+h.ticker+'</span> <span style="font-size:9px;color:var(--text3)">'+h.date+'</span></div>'
        + '<div style="text-align:right"><div style="font-size:10px;color:var(--text);font-family:var(--font-mono)">Rp '+Math.round(h.fairValue||0).toLocaleString('id-ID')+'</div>'
        + '<div style="font-size:9px;color:'+col+'">'+(mos>=0?'+':'')+mos.toFixed(1)+'% MoS</div></div>'
        + '</div>';
    }).join('');
  } catch(e) {}
}

function hw_clearHistory() {
  if (!confirm('Hapus semua histori analisa?')) return;
  localStorage.removeItem('hw_history');
  hw_renderHistoryList();
}
window.hw_clearHistory = hw_clearHistory;

// Auto-init
(function(){
  try {
    if (document.getElementById('hw-data-body') && !window._hwInited) {
      window._hwInited = true;
      hw_init();
    }
  } catch(e){}
})();
