-- Initial database setup for local development.
--
-- The development database (employee_analytics) is created by the
-- MYSQL_DATABASE environment variable; this init script adds the two
-- additional databases the local workflow needs and grants the application
-- user access:
--
--   employee_analytics_test    - the dedicated test database the backend
--                                integration suite truncates between tests
--                                (docs/06-tdd-strategy.md §5.5)
--
--   employee_analytics_shadow  - a pre-created shadow database that Prisma
--                                Migrate uses to detect schema drift. We
--                                pre-create it rather than letting Prisma
--                                create one on demand so the app user
--                                never needs global CREATE/DROP privileges.

CREATE DATABASE IF NOT EXISTS employee_analytics_test;
CREATE DATABASE IF NOT EXISTS employee_analytics_shadow;

GRANT ALL PRIVILEGES ON employee_analytics_test.*   TO 'app'@'%';
GRANT ALL PRIVILEGES ON employee_analytics_shadow.* TO 'app'@'%';

FLUSH PRIVILEGES;
