import type { ThemeConfig } from 'antd';

// "Ledger" — the approved visual direction (see PROGRESS.md). Ink-navy accent
// on warm paper, hairline borders, sharp-ish corners, tabular numerals for
// data. Chosen over Ant Design's stock blue/grey default, which reads as a
// generic admin template with no relation to this business.
export const ledgerTheme: ThemeConfig = {
  token: {
    colorPrimary: '#26344b',
    colorLink: '#26344b',
    colorBgLayout: '#faf9f6',
    colorBgContainer: '#ffffff',
    colorBorder: '#e7e2d9',
    colorBorderSecondary: '#efebe3',
    colorText: '#211f1c',
    colorTextSecondary: '#726c63',
    colorTextTertiary: '#9a9284',
    colorSuccess: '#2f6846',
    colorWarning: '#9c6b14',
    colorError: '#a23b2e',
    borderRadius: 6,
    // Compact control scale (Andre, 2026-08-19: "i like your preview better
    // than the actual — the shape of the button, the font size"). antd's stock
    // 14px/32px is sized for a desktop admin; this app is used on a phone,
    // where the denser 12px/30px reads better and fits more of a row on screen.
    // Set as TOKENS, not per-component overrides, so every control in the app
    // moves together and nothing drifts back to the default.
    //
    // Inputs are exempt on mobile by design: globals.css forces 16px on the
    // focusable input elements under 767px, because iOS Safari auto-zooms the
    // page on any focused input below 16px (see PROGRESS 2026-08-16). That rule
    // is what keeps this change from re-introducing the zoom bug — don't remove
    // it when tuning sizes here.
    fontSize: 12,
    controlHeight: 30,
    controlHeightSM: 24,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", ui-sans-serif, system-ui, sans-serif',
  },
  components: {
    Layout: {
      headerBg: '#26344b',
      siderBg: '#faf9f6',
      bodyBg: '#faf9f6',
    },
    Menu: {
      itemSelectedBg: '#dce3ec',
      itemSelectedColor: '#211f1c',
    },
    Table: {
      headerBg: '#faf9f6',
      borderColor: '#e7e2d9',
    },
  },
};
