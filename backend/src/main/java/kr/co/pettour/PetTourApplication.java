package kr.co.pettour;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@org.springframework.cache.annotation.EnableCaching
public class PetTourApplication {

	public static void main(String[] args) {
		SpringApplication.run(PetTourApplication.class, args);
	}

}
