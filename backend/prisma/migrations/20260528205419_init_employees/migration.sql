-- CreateTable
CREATE TABLE `employees` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(200) NOT NULL,
    `jobTitle` VARCHAR(100) NOT NULL,
    `country` CHAR(2) NOT NULL,
    `department` ENUM('ENGINEERING', 'PRODUCT', 'DESIGN', 'SALES', 'MARKETING', 'CUSTOMER_SUPPORT', 'FINANCE', 'HR', 'OPERATIONS', 'LEGAL', 'OTHER') NOT NULL,
    `salary` DECIMAL(12, 2) NOT NULL,
    `employmentType` ENUM('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN') NOT NULL DEFAULT 'FULL_TIME',
    `hireDate` DATE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `employees_email_key`(`email`),
    INDEX `employees_country_idx`(`country`),
    INDEX `employees_country_jobTitle_idx`(`country`, `jobTitle`),
    INDEX `employees_country_department_idx`(`country`, `department`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
