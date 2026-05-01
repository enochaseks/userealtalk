alter table public.user_money_planner
  add column if not exists next_benefit_pay_date date default null;
