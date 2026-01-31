| column_name     | data_type                | is_nullable | column_default                   |
| --------------- | ------------------------ | ----------- | -------------------------------- |
| id              | uuid                     | NO          | gen_random_uuid()                |
| user_id         | uuid                     | NO          | null                             |
| word            | text                     | NO          | null                             |
| lookup_count    | integer                  | YES         | 1                                |
| first_lookup_at | timestamp with time zone | YES         | now()                            |
| last_lookup_at  | timestamp with time zone | YES         | now()                            |
| is_blacklisted  | boolean                  | YES         | false                            |
| created_at      | timestamp with time zone | YES         | now()                            |
| updated_at      | timestamp with time zone | YES         | now()                            |
| lookups         | ARRAY                    | YES         | '{}'::timestamp with time zone[] |
| contexts        | ARRAY                    | YES         | null                             |


| 约束名称                   | 类型               | 定义详情                                                              |
| ---------------------- | ---------------- | ----------------------------------------------------------------- |
| words_pkey             | PRIMARY KEY (主键) | PRIMARY KEY (id)                                                  |
| words_user_id_fkey     | FOREIGN KEY (外键) | FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE |
| words_user_id_word_key | UNIQUE (唯一约束)    | UNIQUE (user_id, word)                                            |