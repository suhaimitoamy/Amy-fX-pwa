delete from public.amyfx_live_quotes
where source <> 'TWELVE_DATA_WEBSOCKET_EDGE';

alter table public.amyfx_live_quotes
  drop constraint if exists amyfx_live_quotes_websocket_source_check;

alter table public.amyfx_live_quotes
  add constraint amyfx_live_quotes_websocket_source_check
  check (source = 'TWELVE_DATA_WEBSOCKET_EDGE');

comment on constraint amyfx_live_quotes_websocket_source_check
  on public.amyfx_live_quotes is
  'Prevents REST candle or REST price bootstrap values from being presented as Amy FX PWA live prices.';
