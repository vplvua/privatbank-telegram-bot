// PrivatBank API types

export interface PrivatTransaction {
  TRANTYPE: 'C' | 'D'
  SUM: string
  SUM_E: string
  CCY: string
  OSND: string
  AUT_CNTR_NAM: string
  AUT_CNTR_ACC: string
  AUT_CNTR_MFO: string
  AUT_CNTR_MFO_NAME?: string
  AUT_MY_ACC: string
  DAT_KL: string
  DAT_OD: string
  TIM_P: string
  DATE_TIME_DAT_OD_TIM_P: string
  ID: string
  TECHNICAL_TRANSACTION_ID: string
  REF: string
  REFN: string
  NUM_DOC: string
  PR_PR: 'r' | 'p' | 't' | 'n'
  FL_REAL: 'r' | 'i'
}

export interface PrivatTransactionsResponse {
  status: 'SUCCESS' | 'ERROR'
  type: 'transactions'
  exist_next_page: boolean
  next_page_id: string | null
  transactions: PrivatTransaction[]
}

export interface PrivatSettings {
  phase: string
  work_balance: string
  today: string
  lastday: string
  server_date_time: string
  date_final_statement: string
}

export interface PrivatSettingsResponse {
  status: 'SUCCESS' | 'ERROR'
  type: 'settings'
  settings: PrivatSettings
}

// Storage types

export interface ProcessedKeyEntry {
  key: string
  addedAt: string
}

export interface StorageState {
  processedKeys: ProcessedKeyEntry[]
  checkedAt: string
  lastHeartbeatAt?: string
}
