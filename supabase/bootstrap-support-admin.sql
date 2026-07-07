-- Erstellt/aktualisiert den initialen Support-Admin-Zugang.
-- Kann gefahrlos mehrfach ausgefuehrt werden.

alter type user_role add value if not exists 'support_admin';

do $$
declare
  support_user_id uuid;
begin
  select id into support_user_id
  from auth.users
  where email = 'support@schlaglink.app'
  limit 1;

  if support_user_id is null then
    support_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      email_change_token_current,
      reauthentication_token,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      is_sso_user,
      is_anonymous
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      support_user_id,
      'authenticated',
      'authenticated',
      'support@schlaglink.app',
      crypt('1234', gen_salt('bf')),
      now(),
      '',
      '',
      '',
      '',
      '',
      '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"SchlagLink Support","email_verified":true}'::jsonb,
      now(),
      now(),
      false,
      false
    );

    insert into auth.identities (
      id,
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid(),
      support_user_id::text,
      support_user_id,
      jsonb_build_object('sub', support_user_id::text, 'email', 'support@schlaglink.app', 'email_verified', true),
      'email',
      now(),
      now(),
      now()
    )
    on conflict (provider, provider_id) do nothing;
  else
    update auth.users
    set
      encrypted_password = crypt('1234', gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      confirmation_token = coalesce(confirmation_token, ''),
      recovery_token = coalesce(recovery_token, ''),
      email_change_token_new = coalesce(email_change_token_new, ''),
      email_change = coalesce(email_change, ''),
      email_change_token_current = coalesce(email_change_token_current, ''),
      reauthentication_token = coalesce(reauthentication_token, ''),
      raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
      raw_user_meta_data = '{"full_name":"SchlagLink Support","email_verified":true}'::jsonb,
      updated_at = now()
    where id = support_user_id;
  end if;

  insert into profiles (
    id,
    full_name,
    email,
    role,
    organization_id,
    allowed_modules,
    allowed_views
  )
  values (
    support_user_id,
    'SchlagLink Support',
    'support@schlaglink.app',
    'support_admin',
    null,
    array['contractor', 'farmer', 'driver'],
    array['dashboard', 'fields', 'jobs', 'contractor', 'masterData', 'rights', 'test', 'report', 'driver']
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    role = excluded.role,
    organization_id = excluded.organization_id,
    allowed_modules = excluded.allowed_modules,
    allowed_views = excluded.allowed_views;
end $$;
