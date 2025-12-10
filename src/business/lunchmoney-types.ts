///
/// See https://lunchmoney.dev/
///

export interface User {
    user_name: string;
    user_email: string;
    user_id: number;
    account_id: number;
    budget_name: string;
    primary_currency: string;
    api_key_label: string;
}

export interface Tag {
    id: number;
    name: string;
    description: string;
    archived: boolean;
}

export interface Category {
    id: number;
    name: string;
    description: string | null;
    is_income: boolean;
    exclude_from_budget: boolean;
    exclude_from_totals: boolean;
    updated_at: string;
    created_at: string;
    is_group: boolean;
    group_id: number | null;
    archived: boolean;
    archived_on: string | null;
    order: number;
    children?: Category[];
}

export interface Transaction {
    id: number;
    date: string; // e.g. "2025-11-18"
    amount: string; // e.g. "28.6700"
    currency: string;
    to_base: number; // e.g. 28.67
    payee: string;
    category_id: number;
    category_name: string;
    category_group_id: number;
    category_group_name: string;
    is_income: boolean;
    exclude_from_budget: boolean;
    exclude_from_totals: boolean;
    created_at: string; // e.g. "2025-11-18T16:24:50.292Z"
    updated_at: string; // e.g. "2025-11-18T16:24:50.292Z"
    status: string; // e.g. "uncleared";
    is_pending: boolean;
    notes: string | null;
    original_name: string; // e.g. "Withdrawal Transfer To ******6789 Something Something"
    recurring_id: number;
    recurring_payee: string; // e.g. "Withdrawal Transfer To ******6789 Something Something"
    recurring_description: string | null;
    recurring_cadence: string | null; // e.g. "monthly"
    recurring_granularity: string | null; // actually returned, but not in docs
    recurring_quantity: string | null; // actually returned, but not in docs
    recurring_type: string | null; // e.g. "suggested"
    recurring_amount: string | null; // e.g. "1500.0000"
    recurring_currency: string | null; // e.g. "usd"
    parent_id: string | null;
    has_children: boolean;
    group_id: string | null;
    is_group: boolean;
    asset_id: string | null;
    asset_institution_name: string | null;
    asset_name: string | null;
    asset_display_name: string | null;
    asset_status: string | null;
    plaid_account_id: number | null;
    plaid_account_name: string | null;
    plaid_account_mask: string | null;
    institution_name: string | null;
    plaid_account_display_name: string | null;
    plaid_metadata: string | null;
    plaid_category?: string | null; // in docs, but not actually returned
    source: string | null; // e.g. "plaid"
    display_name: string | null;
    display_notes: null;
    account_display_name: string | null;
    tags: { name: string; id: number }[] | null;
    external_id: string | null;
}

export interface PlaidMetadata {
    account_id: string | null; // e.g. "ZE8Q3xxXXxxxXXxxxXXxxxXXxxxXXxtVmgZeE"
    account_owner: string | null; // e.g. "NAME NAMENAME 1234"
    amount: number | null; // e.g. 74.92
    authorized_date: string | null; // e.g. "2025-11-07"
    authorized_datetime: string | null; // e.g. "2025-11-07T00:00:00Z"
    category: (string | null)[] | null; // e.g. ["Shops", "Supermarkets and Groceries"]
    category_id: string | null; // e.g. "19047000"
    check_number: string | null;
    counterparties:
        | null
        | {
              confidence_level: string | null; // e.g. "VERY_HIGH"
              entity_id: string | null; // e.g. "O5W5jxxXXxxxXXxxxXXxxxXXxxxXXxMz2BxWM"
              logo_url: string | null; // e.g. "https://plaid-merchant-logos.plaid.com/walmart_1100.png"
              name: string | null; // e.g. "Walmart"
              phone_number: string | null;
              type: string | null; // e.g. "merchant"
              website: string | null; // e.g. "walmart.com"
          }[];

    date: string | null; // e.g. "2025-11-07"
    datetime: string | null; // e.g. "2025-11-14T00:00:00Z"
    iso_currency_code: string | null; // e.g. "USD"
    location: null | {
        address: string | null; // e.g. "15063 Main St"
        city: string | null; // e.g. "Bellevue"
        country: string | null;
        lat: number | null; // e.g. 47.613785
        lon: number | null; // e.g. -122.18689
        postal_code: string | null; // e.g. "98007"
        region: string | null; // e.g. "WA"
        store_number: string | null; // e.g. "3098"
    };
    logo_url: string | null; // e.g. "https://plaid-merchant-logos.plaid.com/walmart_1100.png"
    merchant_entity_id: string | null; // e.g.  "O5W5jxxXXxxxXXxxxXXxxxXXxxxXXxMz2BxWM"
    merchant_name: string | null; // e.g. "Walmart"
    name: string | null; // e.g. "Walmart"
    payment_channel: string | null; // e.g. "in store"
    payment_meta: null | {
        by_order_of: string | null;
        payee: string | null;
        payer: string | null;
        payment_method: string | null;
        payment_processor: string | null;
        ppd_id: string | null;
        reason: string | null;
        reference_number: string | null;
    };
    pending: boolean | null;
    pending_transaction_id: string | null;
    personal_finance_category: null | {
        confidence_level: string | null; // e.g. "VERY_HIGH"
        detailed: string | null; // e.g. "GENERAL_MERCHANDISE_SUPERSTORES"
        primary: string | null; // e.g. "GENERAL_MERCHANDISE"
        version: string | null; // e.g. "v1"
    };
    personal_finance_category_icon_url: string | null; // e.g.  "https://plaid-category-icons.plaid.com/PFC_GENERAL_MERCHANDISE.png"
    transaction_code: string | null;
    transaction_id: string | null; // e.g. "epEbxxXXxxxXXxxxXXxxxXXxxxXXxxt4aLxvZ"
    transaction_type: string | null; // e.g. "place"
    unofficial_currency_code: string | null;
    website: string | null; // e.g. "walmart.com"
}
