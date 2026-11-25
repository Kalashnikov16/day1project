Questions 

1) extend functionality to update and delete 
2) install postman and do api testing 
3) react app in a separate folder that listens to GET endpoint and shows the data created in data.js of this project 
4) why does the front end call get endpoint twice while reloading 
5) mysqlite database connected, try to implement mysql database by updating prisma schema source, new adapter driver package,
   connection string url, etc.
6) Instead of sending separate user object we can include it in the token itself and get the desired response, learn more about bcrypt, create a sign up 
   or register account api, learn the token lifecyle flow and headers 
7) Try to implement refresh api where access token gets regenerated after expiry and automatically hits the protected api endpoint again to access details instead of
   logging out continuously.
8) Generate refresh token and store in backend. Needed because when you hit the refresh api it will ask for refresh token before geenrating new access token
9) dont auto log in after registering user
10) interceptor/axios in react which will handle appending header centrally in one file
11) do not repeat yourself, try to set dot env variables for base url 
12) refresh api and token replacement, separate session table with refresh key and iat and expiry
13) once refresh key expires then logout api should be hit automatically
14) use httponly cookie to store refresh token and get basic user details from access token in local storage 
15) implement two roles - admin and user and admin can see everyone's details but user can only see his/her details 
16) forgot password and otp verification after user registration**
17) create a role and user role table and refresh token table(iat,exp,user.id)
18) implement request from admin to upgrade user role using user request status table
19) sse should handle auto logout when role is updgraded to admin
20) Read up on normalization and sse flow**
21) https://mailtrap.io for smtp mail service, https://www.twilio.com/en-us for sms, https://baileys.wiki for whatsapp 
