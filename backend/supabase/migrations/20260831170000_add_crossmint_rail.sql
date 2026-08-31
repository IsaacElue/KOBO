-- Crossmint staging feasibility spike accepted — adds "crossmint" as a valid
-- funding rail. Additive only: existing rows/constraint values are untouched,
-- this only widens the allowed set. Postgres can't ALTER a check constraint
-- in place — drop and re-add with the same values plus 'crossmint', same
-- pattern as 20260830180000_add_funding_rail.sql.

alter table funding_requests
  drop constraint if exists funding_requests_rail_check;

alter table funding_requests
  add constraint funding_requests_rail_check
    check (rail in ('moonpay', 'transak', 'coinbase', 'sepa', 'stripe', 'crossmint'));
